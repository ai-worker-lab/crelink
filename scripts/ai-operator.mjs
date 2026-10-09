#!/usr/bin/env node
// AI 운영자 실행 호스트 도구. 프리체크·실행 기록 열기/닫기·직전 실행 읽기·운영자 API 호출·Orca 자동화 명령 출력.
// 기준: docs/ops/ai-operator.md(헌장), docs/specs/crelink-ai-operator.md(설계).
// 프리체크가 `git show origin/main:scripts/ai-operator.mjs`로 꺼내 실행하므로 Node 내장 모듈만 쓰고 다른 파일을 import하지 않습니다.
// 사용법: node scripts/ai-operator.mjs <precheck|start|context|api|finish|automation-command> [옵션]  (--help)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = `사용법: node scripts/ai-operator.mjs <명령> [옵션]

  precheck                      실행해도 되는지 확인(Orca --precheck). 진행 가능 0, 멈춤·진행 중·설정·연결 오류 1.
                                멈춤이면 'paused' 실행 기록을 남깁니다.
  start [--trigger manual]      실행 기록을 열고 실행 id를 저장·출력. 멈춤·진행 중이면 1.
  guard                         지금 일을 계속해도 되는지 다시 확인. main 머지·외부 공개·운영 쓰기 묶음 직전에 반드시 부릅니다.
                                멈춤이 켜졌거나 이번 실행 기록이 닫혔으면(포기 포함) 1, 계속해도 되면 0.
  context                       멈춤 상태, 직전 실행 5개(요약·다음 할 일·링크), 지표를 출력.
  api <METHOD> <경로> [JSON|@파일|file=@이미지]
                                운영자·크리에이터 API 호출(예: api GET /api/admin/creators). 쓰기는 실행 헤더가 자동으로 붙습니다.
                                file=@<이미지>는 POST /api/me/files multipart 업로드. 2xx 0, 그 밖 1.
  finish --status succeeded|failed --summary <글> [--action <한 일>]... [--next <다음 할 일>]...
         [--ref <kind>=<이름>[=<URL>]]... [--model <이름>] [--cost <USD>] [--input-tokens N] [--output-tokens N]
                                실행 기록을 닫습니다. kind: pr|work_item|commit|deploy|other
  automation-command [--repo <기준 checkout 경로>]
                                Orca 자동화 생성 명령을 출력합니다(실행하지 않음).

설정: ~/.config/crelink/ai-operator.env(권한 600, CRELINK_AI_ENV_FILE로 바꿈)의
  CRELINK_AI_BASE_URL(예: https://links.shaul.kr/api/agent), CRELINK_AI_TOKEN, 선택 CRELINK_AI_HOST·CRELINK_AI_MODEL.
  같은 이름의 환경변수가 파일보다 우선합니다. 진행 중 실행 id: ~/.local/state/crelink/ai-operator/current-run
  (CRELINK_AI_STATE_DIR로 바꿈).`;

const RUN_HEADER = 'X-Crelink-Agent-Run';
const USER_AGENT = 'crelink-ai-operator/1';
const STALE_RUN_MINUTES = 90;
const REF_KINDS = ['pr', 'work_item', 'commit', 'deploy', 'other'];
const scriptDir = dirname(fileURLToPath(import.meta.url));

class CliError extends Error {}

function fail(message) {
  throw new CliError(message);
}

// ---------- 설정 ----------

function envFilePath() {
  return process.env.CRELINK_AI_ENV_FILE || join(homedir(), '.config/crelink/ai-operator.env');
}

function stateDir() {
  return process.env.CRELINK_AI_STATE_DIR || join(homedir(), '.local/state/crelink/ai-operator');
}

/** 설정 파일(있으면, 권한 600 확인)과 환경변수를 합칩니다. 환경변수가 우선입니다. 토큰 값은 출력하지 않습니다. */
function loadConfig() {
  const file = envFilePath();
  const values = {};
  if (existsSync(file)) {
    const mode = statSync(file).mode & 0o777;
    if (mode & 0o077) {
      fail(`${file} 권한이 ${mode.toString(8)}입니다. chmod 600 ${file} 로 본인만 읽게 하세요.`);
    }
    for (const row of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = row.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const read = (name) => process.env[name] || values[name] || '';
  const baseUrl = read('CRELINK_AI_BASE_URL').replace(/\/$/, '');
  const token = read('CRELINK_AI_TOKEN');
  if (!baseUrl || !token) {
    fail(
      `CRELINK_AI_BASE_URL과 CRELINK_AI_TOKEN이 필요합니다(${file} 또는 환경변수). 발급: infra/docs/prod-runbook.md 16`,
    );
  }
  return { baseUrl, token, host: read('CRELINK_AI_HOST') || null, model: read('CRELINK_AI_MODEL') || null };
}

// ---------- 진행 중 실행 id ----------

function currentRunFile() {
  return join(stateDir(), 'current-run');
}

function readCurrentRun() {
  const file = currentRunFile();
  if (!existsSync(file)) return null;
  const id = readFileSync(file, 'utf8').trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function writeCurrentRun(id) {
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  writeFileSync(currentRunFile(), `${id}\n`, { mode: 0o600 });
}

function clearCurrentRun() {
  rmSync(currentRunFile(), { force: true });
}

// ---------- HTTP ----------

/** API 호출. 응답 본문(JSON 또는 null)과 상태를 돌려줍니다. 연결 실패·시간 초과는 CliError입니다. */
async function call(config, method, path, { body, runId, timeoutMs = 20000 } = {}) {
  if (!path.startsWith('/api/')) fail(`경로는 /api/로 시작해야 합니다: ${path}`);
  const headers = { Authorization: `Bearer ${config.token}`, Accept: 'application/json', 'User-Agent': USER_AGENT };
  if (runId) headers[RUN_HEADER] = runId;
  let payload;
  if (body instanceof FormData) {
    // multipart: boundary가 붙은 Content-Type은 fetch가 정합니다.
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    fail(`${method} ${path} 연결 실패: ${error.cause?.code ?? error.name ?? error.message}`);
  }
  const text = await response.text();
  let data = null;
  let json = true;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      json = false;
      data = { raw: text.slice(0, 500) };
    }
  }
  // Cloudflare가 실행 호스트를 막으면 API가 아닌 Cloudflare 응답(챌린지 HTML 등)이 옵니다. 연결 실패와 같게 다룹니다.
  if (response.headers.has('cf-mitigated') || (response.status === 403 && !json)) {
    fail(
      `${method} ${path}: 실행 호스트가 Cloudflare에 차단되었습니다(${response.status}). VPN·exit node를 끄고 다시 시도하세요.`,
    );
  }
  return { status: response.status, ok: response.ok, data };
}

function describeError(result) {
  const code = result.data?.code ?? 'http_error';
  const message = result.data?.message ?? '';
  return `${result.status} ${code}${message ? ` ${message}` : ''}`;
}

async function expectOk(config, method, path, options) {
  const result = await call(config, method, path, options);
  if (!result.ok) fail(`${method} ${path} 실패: ${describeError(result)}`);
  return result.data;
}

// ---------- 표시 ----------

const seoul = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'short',
  timeStyle: 'short',
  hourCycle: 'h23',
});

function at(value) {
  return value ? seoul.format(new Date(value)) : '-';
}

function minutesSince(value) {
  return (Date.now() - new Date(value).getTime()) / 60000;
}

function formatRun(run) {
  const lines = [
    `- [${run.status}] ${at(run.startedAt)} ~ ${at(run.endedAt)} (${run.id})${run.pausedCount > 1 ? ` 멈춤 ${run.pausedCount}회` : ''}`,
  ];
  if (run.summary) lines.push(`  요약: ${run.summary}`);
  for (const action of run.actions ?? []) lines.push(`  한 일: ${action}`);
  for (const next of run.nextSteps ?? []) lines.push(`  다음: ${next}`);
  for (const ref of run.refs ?? []) lines.push(`  링크(${ref.kind}): ${ref.label}${ref.url ? ` ${ref.url}` : ''}`);
  if (run.operatorActionCount) lines.push(`  운영 쓰기: ${run.operatorActionCount}건`);
  return lines.join('\n');
}

// ---------- 명령 ----------

async function precheck() {
  const config = loadConfig();
  const status = await expectOk(config, 'GET', '/api/admin/ai-operator', { timeoutMs: 15000 });
  if (status.paused) {
    const result = await call(config, 'POST', '/api/admin/agent-runs', {
      body: { trigger: 'schedule', host: config.host, model: config.model },
      timeoutMs: 15000,
    });
    if (!result.ok) fail(`멈춤 상태이고 멈춤 기록도 남기지 못했습니다: ${describeError(result)}`);
    console.log(`멈춤: 실행하지 않습니다(사유: ${status.pausedReason ?? '없음'}). 기록 ${result.data.id}`);
    return 1;
  }
  const running = status.runningRun;
  if (running && minutesSince(running.startedAt) < STALE_RUN_MINUTES) {
    console.log(`진행 중 실행이 있어 건너뜁니다: ${running.id}(${at(running.startedAt)} 시작)`);
    return 1;
  }
  console.log(
    running ? `오래된 진행 중 실행 ${running.id}는 시작 때 abandoned로 닫힙니다. 진행합니다.` : '진행 가능합니다.',
  );
  return 0;
}

/**
 * 멈춤 스위치는 크리링 API 쓰기만 즉시 거절합니다. main 머지(=배포)·외부 공개처럼 API를 거치지 않는 일은 이 확인으로 막습니다
 * (헌장 `한 실행의 순서`, 보안 검토 F2). 확인에 실패해도(연결 오류 등) 종료 1이라 계속하지 않습니다.
 */
async function guard() {
  const config = loadConfig();
  const status = await expectOk(config, 'GET', '/api/admin/ai-operator', { timeoutMs: 15000 });
  if (status.paused) {
    console.log(`멈춤: 계속하지 않습니다(사유: ${status.pausedReason ?? '없음'}). finish로 기록만 닫으세요.`);
    return 1;
  }
  const current = readCurrentRun();
  if (!current || status.runningRun?.id !== current) {
    console.log(`이번 실행 기록(${current ?? '없음'})이 진행 중이 아닙니다. 계속하지 않습니다.`);
    return 1;
  }
  console.log('계속해도 됩니다.');
  return 0;
}

async function start(args) {
  const { values } = parseArgs({ args, options: { trigger: { type: 'string', default: 'schedule' } } });
  if (!['schedule', 'manual'].includes(values.trigger)) fail('--trigger는 schedule 또는 manual입니다.');
  const config = loadConfig();
  const previous = readCurrentRun();
  const result = await call(config, 'POST', '/api/admin/agent-runs', {
    body: { trigger: values.trigger, host: config.host, model: config.model },
  });
  if (result.status === 409) {
    console.log(`시작하지 않습니다: ${describeError(result)}`);
    return 1;
  }
  if (!result.ok) fail(`실행 기록을 열지 못했습니다: ${describeError(result)}`);
  const run = result.data;
  if (run.status === 'paused') {
    // 진행 중인 다른 실행의 id 파일은 그대로 둡니다(그 실행은 멈춤 중에도 finish로 닫을 수 있음).
    console.log(`멈춤: 실행하지 않습니다. 기록 ${run.id}`);
    return 1;
  }
  if (previous) console.error(`닫히지 않은 이전 실행 id 파일(${previous})을 새 실행으로 바꿉니다.`);
  writeCurrentRun(run.id);
  console.log(`실행 id: ${run.id}`);
  console.log(`커밋 트레일러: AI-Operator-Run: ${run.id}`);
  return 0;
}

async function context() {
  const config = loadConfig();
  const [status, runs, metrics] = await Promise.all([
    expectOk(config, 'GET', '/api/admin/ai-operator'),
    expectOk(config, 'GET', '/api/admin/agent-runs'),
    expectOk(config, 'GET', '/api/admin/metrics'),
  ]);
  const current = readCurrentRun();
  const out = [];
  out.push(`# 상태 (${at(new Date().toISOString())})`);
  out.push(`멈춤: ${status.paused ? `켜짐(${status.pausedReason ?? '사유 없음'})` : '꺼짐'}`);
  out.push(`이번 실행: ${current ?? '없음(start를 먼저 실행)'}`);
  out.push('');
  out.push('# 지표');
  out.push(`실사용자: ${metrics.realUsers} / ${metrics.goal.realUsers}`);
  out.push(`크리에이터: ${metrics.creators.total}명(지표 제외 ${metrics.creators.excluded}명)`);
  out.push(
    `가입: 24시간 ${metrics.signups.last24Hours}, 7일 ${metrics.signups.last7Days}, 30일 ${metrics.signups.last30Days}`,
  );
  out.push(`방문: 7일 ${metrics.visits.last7Days}, 30일 ${metrics.visits.last30Days}`);
  out.push(`링크 클릭: 7일 ${metrics.linkClicks.last7Days}, 30일 ${metrics.linkClicks.last30Days}`);
  out.push(
    `크리링 배너: 게시 ${metrics.adBanners.live}개, 7일 노출 ${metrics.adBanners.impressionsLast7Days}·클릭 ${metrics.adBanners.clicksLast7Days}`,
  );
  for (const event of metrics.events ?? []) out.push(`${event.label}: ${event.value}`);
  out.push('');
  out.push('# 직전 실행(최신순)');
  const previous = runs.items.filter((run) => run.id !== current).slice(0, 5);
  out.push(previous.length ? previous.map(formatRun).join('\n') : '- 없음');
  console.log(out.join('\n'));
  return 0;
}

/** 업로드 확장자 → Content-Type(API 허용 형식 `ALLOWED_IMAGE_TYPES`와 같음). */
const UPLOAD_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** `file=@<경로>`는 multipart 업로드(`POST /api/me/files`의 `file` 필드), 그 밖은 JSON 또는 `@파일`(JSON)입니다. */
function readBody(value) {
  if (value === undefined) return undefined;
  const upload = value.match(/^file=@(.+)$/);
  if (upload) {
    const path = resolve(upload[1]);
    const type = UPLOAD_TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()];
    if (!type) fail(`업로드는 ${Object.keys(UPLOAD_TYPES).join('·')} 파일만 됩니다: ${path}`);
    const form = new FormData();
    form.append('file', new Blob([readFileSync(path)], { type }), path.slice(path.lastIndexOf('/') + 1));
    return form;
  }
  const text = value.startsWith('@') ? readFileSync(resolve(value.slice(1)), 'utf8') : value;
  try {
    return JSON.parse(text);
  } catch {
    fail('본문은 JSON이어야 합니다(또는 @파일).');
  }
}

async function api(args) {
  const [method, path, bodyArg] = args;
  if (!method || !path) fail('api <METHOD> <경로> [JSON|@파일]');
  const upper = method.toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upper)) fail(`지원하지 않는 메서드: ${method}`);
  const config = loadConfig();
  const runId = readCurrentRun();
  if (upper !== 'GET' && !runId) fail('쓰기 요청은 실행 기록이 열려 있어야 합니다. start를 먼저 실행하세요.');
  const result = await call(config, upper, path, { body: readBody(bodyArg), runId });
  console.log(JSON.stringify(result.data, null, 2) ?? '');
  if (!result.ok) {
    console.error(`실패: ${describeError(result)}`);
    return 1;
  }
  return 0;
}

function parseRef(value) {
  const [kind, label, ...rest] = value.split('=');
  if (!REF_KINDS.includes(kind) || !label) fail(`--ref는 <${REF_KINDS.join('|')}>=<이름>[=<URL>] 형식입니다: ${value}`);
  const url = rest.join('=');
  return { kind, label, url: url || null };
}

function optionalNumber(value, name) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${name}는 0 이상의 수입니다.`);
  return number;
}

async function finish(args) {
  const { values } = parseArgs({
    args,
    options: {
      status: { type: 'string' },
      summary: { type: 'string' },
      action: { type: 'string', multiple: true, default: [] },
      next: { type: 'string', multiple: true, default: [] },
      ref: { type: 'string', multiple: true, default: [] },
      model: { type: 'string' },
      cost: { type: 'string' },
      'input-tokens': { type: 'string' },
      'output-tokens': { type: 'string' },
    },
  });
  if (!['succeeded', 'failed'].includes(values.status ?? '')) fail('--status succeeded|failed가 필요합니다.');
  if (!values.summary?.trim()) fail('--summary가 필요합니다.');
  const config = loadConfig();
  const runId = readCurrentRun();
  if (!runId) fail('열린 실행이 없습니다(start를 먼저 실행).');
  const body = {
    status: values.status,
    summary: values.summary.trim(),
    actions: values.action,
    nextSteps: values.next,
    refs: values.ref.map(parseRef),
    model: values.model ?? config.model ?? undefined,
    costUsd: optionalNumber(values.cost, '--cost'),
    inputTokens: optionalNumber(values['input-tokens'], '--input-tokens'),
    outputTokens: optionalNumber(values['output-tokens'], '--output-tokens'),
  };
  const result = await call(config, 'PATCH', `/api/admin/agent-runs/${runId}`, { body, runId });
  if (!result.ok) {
    // 이미 닫혔거나(409) 없어진 실행(404)은 다시 닫을 수 없으므로 id 파일을 지웁니다.
    if (result.status === 409 || result.status === 404) clearCurrentRun();
    fail(`실행 기록을 닫지 못했습니다: ${describeError(result)}`);
  }
  clearCurrentRun();
  console.log(`실행 기록을 닫았습니다: ${runId} (${result.data.status})`);
  return 0;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 기준 checkout(공통 .git의 부모). worktree 안에서 실행해도 같은 곳을 가리킵니다. */
function defaultRepo() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: scriptDir,
      encoding: 'utf8',
    }).trim();
    return dirname(common);
  } catch {
    return resolve(scriptDir, '..');
  }
}

function automationCommand(args) {
  const { values } = parseArgs({ args, options: { repo: { type: 'string' } } });
  const repo = resolve(values.repo ?? defaultRepo());
  const promptFile = join(scriptDir, '../docs/ops/ai-operator-prompt.md');
  const prompt = readFileSync(promptFile, 'utf8').trim();
  // 기준 checkout의 작업 트리는 건드리지 않고(fetch는 원격 참조만 갱신), 최신 main의 이 스크립트를 임시 파일로 꺼내 실행합니다.
  const temp = '"${TMPDIR:-/tmp}/crelink-ai-operator-precheck.mjs"';
  const precheckCommand = [
    `git -C ${shellQuote(repo)} fetch -q origin main`,
    `git -C ${shellQuote(repo)} show origin/main:scripts/ai-operator.mjs > ${temp}`,
    `node ${temp} precheck`,
  ].join(' && ');
  const parts = [
    'orca automations create',
    `--name ${shellQuote('crelink-ai-operator')}`,
    `--trigger ${shellQuote('*/30 * * * *')}`,
    '--timezone Asia/Seoul',
    '--provider omp',
    `--repo ${shellQuote(`path:${repo}`)}`,
    '--workspace-mode new-per-run',
    '--base-branch origin/main',
    `--precheck ${shellQuote(precheckCommand)}`,
    '--precheck-timeout 60',
    '--missed-run-grace-minutes 10',
    '--enabled',
    `--prompt ${shellQuote(prompt)}`,
  ];
  console.log(parts.join(' \\\n  '));
  return 0;
}

const COMMANDS = {
  precheck: () => precheck(),
  start,
  guard: () => guard(),
  context: () => context(),
  api,
  finish,
  'automation-command': automationCommand,
};

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`알 수 없는 명령: ${command}\n\n${USAGE}`);
    return 1;
  }
  return handler(args);
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`ai-operator: ${error instanceof CliError ? error.message : (error?.stack ?? String(error))}`);
  process.exitCode = 1;
}
