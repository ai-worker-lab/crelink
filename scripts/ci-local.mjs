#!/usr/bin/env node
// CI(.github/workflows/ci.yml)의 job을 이 기기에서 재현합니다(ADR 0016 결정 5). 사용법: pnpm ci:local [--report [--dry-run]]
// origin/main 기준으로 문서만 바뀌었으면 문서 검사만, 아니면 work:scope → DB → verify → 스택 → ego 시험 → 이미지 빌드를 실행합니다.
// 이미지는 Docker 서버의 고유 플랫폼으로 빌드해 Dockerfile·의존성 오류를 잡습니다. linux/amd64 빌드는 deploy.yml이 서버를 건드리기 전에 검증합니다.
// 실패가 있어도 CI job처럼 남은 단계를 끝까지 돌리고 하나라도 실패하면 종료 코드 1로 끝납니다. 이 실행이 띄운 스택만 내립니다.
// --report는 통과한 커밋에 commit status `CI 통과`를 기록합니다. gh의 현재 인증(GH_TOKEN 또는 gh auth)을 씁니다.
// 전제: main ruleset의 필수 검사 `CI 통과`는 integration_id 15368(GitHub Actions)로 묶여 있고 strict입니다. 이 묶음을 바꾸기 전에는
// 여기서 기록한 status가 필수 검사로 인정되지 않습니다. strict 때문에 main보다 뒤처진 커밋의 status도 머지에 쓰이지 않습니다.
// 기준 문서: docs/development/verification.md#로컬-ci
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  isCodeFile,
  parseCliArgs,
  porcelainPaths,
  repoFromRemote,
  REPORT_CONTEXT,
  reportBlockers,
  statusRequestArgs,
  USAGE,
} from './lib/ci-local.mjs';
import { ensureInstance } from './lib/instance.mjs';
import { branchItemId } from './lib/work-items.mjs';
import { pm2Home } from './pm2-home.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'origin/main';
// ego-lite로 옮긴 시험 모음입니다. 옮기면 여기에 더하고 아래 NOT_LOCAL에서 뺍니다.
const EGO_SUITES = ['tests/e2e/ego/smoke.mjs', 'tests/e2e/ego/analytics-responsive.mjs', 'tests/e2e/ego/visitor.mjs'];
// CI의 코드 경로에는 있지만 로컬에서 돌지 않는 검사입니다. 실행 요약에 `로컬 CI 미포함`으로 표시합니다.
const NOT_LOCAL = [
  '핵심 사용자 E2E: creator, operator, notices, guestbook, instabio-import',
  '가상 사용자 E2E: personas',
  'analytics-responsive의 WebKit·Firefox (Chromium은 ego로 옮김)',
  'tests/e2e/link-layout.config.ts 3엔진 (link-layout, list-density)',
  'pnpm verify의 Node 26 (CI 행렬은 24·26, 로컬은 .nvmrc 기준)',
];
const APP_SERVICES = ['api', 'web', 'app'];
const READY_TIMEOUT_MS = 180_000;
const IMAGE_HINT =
  '출력의 첫 오류를 찾으세요. 재현: docker buildx build -f apps/<api|web>/Dockerfile --output type=cacheonly .';
const HINTS = {
  '이미지 api': IMAGE_HINT,
  '이미지 web': IMAGE_HINT,
  'work:scope': '소유 경로 밖 변경입니다. 출력의 해결 안내를 따르세요.',
  'pnpm verify': '위쪽 `검증 요약`의 해결 안내를 따르세요.',
  'pnpm verify --docs': '위쪽 `검증 요약`의 해결 안내를 따르세요.',
  'DB 시작': 'Docker가 실행 중인지 확인하세요. 재현: make infra-up',
  '스택 시작': '서비스 로그를 확인하세요: pnpm logs api, pnpm logs web',
  '스택 정리': '남은 서비스를 확인하고 내리세요: make status, make down',
};

let options;
try {
  options = parseCliArgs(process.argv.slice(2));
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tryGit = (...args) => {
  try {
    return git(...args).trim();
  } catch {
    return null;
  }
};
const statusPaths = () => porcelainPaths(git('status', '--porcelain', '-z', '--no-renames', '--untracked-files=all'));

// 신호는 진행 중인 단계의 프로세스 그룹에 전달하고, 남은 단계는 건너뛴 뒤 스택을 정리합니다. 두 번째 신호는 강제 종료입니다.
const interrupt = new AbortController();
let signalExitCode;
let child = null;
const signalChild = (name) => {
  try {
    if (child?.pid) process.kill(-child.pid, name);
  } catch {
    // 이미 끝난 프로세스 그룹입니다.
  }
};
for (const [name, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(name, () => {
    if (signalExitCode !== undefined) {
      signalChild('SIGKILL');
      return;
    }
    signalExitCode = code;
    console.error(`\n${name} 수신: 진행 중인 단계를 멈추고 이 실행이 띄운 스택을 정리합니다.`);
    interrupt.abort();
    signalChild(name);
  });
}

/** 터미널 신호가 자식에게 두 번 가지 않도록 별도 프로세스 그룹으로 실행합니다(detached). 그룹 전달은 signalChild가 합니다. */
function run(command, args, env = process.env) {
  return new Promise((resolve) => {
    const started = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'], detached: true });
    child = started;
    started.on('error', (error) => {
      child = null;
      resolve({ error });
    });
    started.on('close', (code, signal) => {
      child = null;
      resolve({ code, signal });
    });
  });
}

const exec = async (command, args, env) => {
  const { code, signal, error } = await run(command, args, env);
  if (error) return `실행 실패: ${error.message}`;
  if (signal) return `신호 ${signal}`;
  return code === 0 ? undefined : `종료 코드 ${code}`;
};

const results = [];
const warnings = [];
const skip = (step, reason) => results.push({ step, status: '건너뜀', reason });
let imagePlatform;

/** action은 실패 이유 문자열을 돌려주고 성공이면 undefined입니다. 통과 여부를 돌려줍니다. */
async function step(name, action, { always = false } = {}) {
  if (interrupt.signal.aborted && !always) {
    skip(name, '중단됨');
    return false;
  }
  console.log(`\n▶ ${name}`);
  const started = Date.now();
  let reason;
  try {
    reason = await action();
  } catch (error) {
    reason = `실행 실패: ${error.message}`;
  }
  const seconds = (Date.now() - started) / 1000;
  results.push({ step: name, status: reason ? '실패' : '통과', seconds, reason });
  return !reason;
}

/** Docker 서버의 고유 플랫폼입니다. Node가 Rosetta로 돌 수도 있어 process.arch가 아니라 서버에 묻습니다. */
function dockerPlatform() {
  const arch = execFileSync('docker', ['version', '--format', '{{.Server.Arch}}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return `linux/${arch.trim()}`;
}

function warn(message) {
  warnings.push(message);
  console.warn(`경고: ${message}`);
}

/** CI `changes` job처럼 판정합니다. 작업 트리 변경도 검사 대상이므로 포함하고, 비교할 수 없으면 null입니다(코드로 봄). */
function changedFiles() {
  let committed;
  try {
    // 이름 변경은 옛 경로와 새 경로를 모두 셉니다(work-scope.mjs와 같음). 코드를 docs/로 옮긴 변경을 문서로 보지 않습니다.
    committed = git('diff', '--name-only', '--no-renames', '-z', `${BASE}...HEAD`).split('\0');
  } catch {
    return null;
  }
  return [...new Set([...committed, ...statusPaths()].filter(Boolean))].sort();
}

async function workScope() {
  const branch = tryGit('branch', '--show-current') ?? '';
  if (!branchItemId(branch)) {
    skip('work:scope', `work/NNNN-* 브랜치가 아닙니다(${branch || 'detached HEAD'})`);
    return;
  }
  await step('work:scope', () => exec('pnpm', ['work:scope', '--base', BASE]));
}

function runningInfraServices(project) {
  try {
    const output = execFileSync(
      'docker',
      [
        'ps',
        '--filter',
        `label=com.docker.compose.project=${project}`,
        '--filter',
        'status=running',
        '--format',
        '{{.Label "com.docker.compose.service"}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: Number(port) });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1_000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });

/** PM2로 띄웠든 직접 띄웠든 포트가 열려 있으면 이미 떠 있는 서비스입니다. PM2 상태만 보면 직접 띄운 서버와 충돌합니다. */
async function snapshotStack(instance) {
  const ports = { api: instance.API_PORT, web: instance.WEB_PORT, app: instance.EXPO_PORT };
  const apps = new Set();
  for (const service of APP_SERVICES) {
    if (await portOpen(ports[service])) apps.add(service);
  }
  return { infra: runningInfraServices(instance.COMPOSE_PROJECT_NAME).length > 0, apps };
}

async function urlsReady(urls) {
  const signal = AbortSignal.any([interrupt.signal, AbortSignal.timeout(30_000)]);
  try {
    const responses = await Promise.all(urls.map((url) => fetch(url, { signal })));
    return responses.every((response) => response.ok);
  } catch {
    return false;
  }
}

async function waitForStack(instance) {
  const urls = [new URL('/api/health/ready', instance.API_URL).href, instance.WEB_URL];
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (interrupt.signal.aborted) return '중단됨';
    if (await urlsReady(urls)) return undefined;
    await sleep(2_000, undefined, { signal: interrupt.signal }).catch(() => {});
  }
  return `API·웹이 ${READY_TIMEOUT_MS / 1000}초 안에 준비되지 않았습니다.`;
}

async function teardown(instance, started) {
  const targets = [...started.apps].reverse().map((service) => `${service}-down`);
  const infra = started.infra && runningInfraServices(instance.COMPOSE_PROJECT_NAME).length > 0;
  if (infra) targets.push('infra-down');
  if (targets.length === 0) {
    skip('스택 정리', '이 실행이 띄운 스택이 없습니다');
    return;
  }
  await step(
    '스택 정리',
    async () => {
      const reason = await exec('make', targets);
      // 앱을 모두 이 실행이 띄웠으면 PM2 데몬도 이 실행의 것입니다(make down과 같음).
      if (started.apps.length === APP_SERVICES.length) {
        await exec('pnpm', ['exec', 'pm2', 'kill'], { ...process.env, PM2_HOME: pm2Home });
      }
      return reason;
    },
    { always: true },
  );
}

async function docsPath() {
  await step('pnpm verify --docs', () => exec('pnpm', ['verify', '--docs', '--keep-going']));
  await workScope();
}

async function codePath() {
  await workScope();

  let instance;
  const prepared = await step('인스턴스 설정', () => {
    instance = ensureInstance(root);
  });
  if (prepared) await stackStages(instance);

  for (const area of ['api', 'web']) {
    // CI의 push: false와 같이 결과를 어디에도 내보내지 않습니다. 이미지 저장소에 태그 없는 이미지를 쌓지 않으려고 cacheonly를 씁니다.
    // Apple Silicon의 QEMU에서는 linux/amd64 next build가 크래시해 고유 플랫폼으로 빌드합니다(docs/work/orchestrator/0210-local-ci.md).
    await step(`이미지 ${area}`, () => {
      imagePlatform ??= dockerPlatform();
      console.log(`플랫폼: ${imagePlatform}`);
      return exec('docker', [
        'buildx',
        'build',
        '--platform',
        imagePlatform,
        '--output',
        'type=cacheonly',
        '-f',
        `apps/${area}/Dockerfile`,
        '.',
      ]);
    });
  }
}

async function stackStages(instance) {
  // 어떤 단계도 시작하기 전에 봐야 합니다. make infra-up 뒤에는 이 실행이 띄운 DB와 구별할 수 없습니다.
  const before = await snapshotStack(instance);
  const started = { infra: false, apps: [] };
  try {
    await step('DB 시작', () => {
      started.infra = !before.infra;
      return exec('make', ['infra-up']);
    });
    await step('pnpm verify', () => exec('pnpm', ['verify', '--keep-going']));

    const missing = APP_SERVICES.filter((service) => !before.apps.has(service));
    // 이미 떠 있는 서비스는 make <서비스>-up이 지우고 다시 띄우므로 없는 것만 띄웁니다.
    const targets = missing.length === APP_SERVICES.length ? ['up'] : missing.map((service) => `${service}-up`);
    const ready = await step('스택 시작', async () => {
      if (targets.length > 0) {
        started.apps = missing;
        const reason = await exec('make', targets);
        if (reason) return reason;
      } else {
        console.log('이미 떠 있는 스택을 그대로 씁니다.');
      }
      return waitForStack(instance);
    });

    for (const suite of EGO_SUITES) {
      const name = `ego ${suite.replace(/^.*\//, '').replace(/\.mjs$/, '')}`;
      if (!ready && !interrupt.signal.aborted) skip(name, '스택이 준비되지 않았습니다');
      else await step(name, () => exec(process.execPath, [suite]));
    }
  } finally {
    await teardown(instance, started);
  }
}

function summarize(kind) {
  const total = results.reduce((sum, result) => sum + (result.seconds ?? 0), 0);
  const failed = results.filter((result) => result.status === '실패');
  const skipped = results.filter((result) => result.status === '건너뜀');
  console.log(`\n로컬 CI 요약 (pnpm ci:local, ${kind})`);
  for (const { step: name, status, seconds, reason } of results) {
    const time = seconds === undefined ? '' : `${seconds.toFixed(1)}s`;
    // 한글은 터미널에서 두 칸이라 이름을 앞에 두고 맞추면 줄이 어긋납니다. 폭이 일정한 시간을 앞에 둡니다.
    console.log(`  ${time.padStart(7)}  ${status}  ${name}${reason ? ` (${reason})` : ''}`);
  }
  if (kind === '코드 변경') {
    console.log('\n로컬 CI 미포함 (CI에는 있고 여기서는 돌지 않는 검사)');
    for (const item of NOT_LOCAL) console.log(`  - ${item}`);
    if (imagePlatform && imagePlatform !== 'linux/amd64') {
      console.log(`  - 이미지 linux/amd64 (이 기기는 ${imagePlatform}로 빌드, amd64 빌드는 Deploy에서 검증)`);
    }
  }
  if (warnings.length > 0) {
    console.log('\n경고');
    for (const message of warnings) console.log(`  - ${message}`);
  }
  if (failed.length > 0) {
    console.log('\n해결 안내');
    for (const { step: name } of failed) console.log(`  ${name}: ${HINTS[name] ?? '위쪽 출력을 확인하세요.'}`);
  }
  return {
    failed: failed.map(({ step: name }) => name),
    line: `결과: ${failed.length > 0 ? '실패' : '통과'} — 통과 ${results.length - failed.length - skipped.length}, 실패 ${failed.length}, 건너뜀 ${skipped.length}, 총 ${total.toFixed(1)}s`,
  };
}

/** 기록했거나 dry-run에서 조건을 모두 만족했으면 true입니다. */
async function reportStatus({ failed, kind, startSha, dirtyAtStart }) {
  const endSha = tryGit('rev-parse', 'HEAD');
  const branch = tryGit('branch', '--show-current') ?? '';
  const remote = branch ? tryGit('ls-remote', '--heads', 'origin', `refs/heads/${branch}`) : null;
  const repo = repoFromRemote(tryGit('remote', 'get-url', 'origin'));
  const blockers = reportBlockers({
    interrupted: signalExitCode !== undefined,
    failed,
    dirtyAtStart,
    dirtyAtEnd: statusPaths().length > 0,
    startSha,
    endSha,
    branch,
    remoteSha: remote?.split(/\s/)[0] ?? '',
    repo,
  });
  const description = `pnpm ci:local 통과 (${kind}, Node ${process.versions.node})`;
  const args = statusRequestArgs({ repo: repo ?? '<저장소 불명>', sha: endSha, description });
  console.log('\ncommit status 기록');
  console.log(`  대상 SHA: ${endSha}`);
  console.log(`  context: ${REPORT_CONTEXT}`);
  console.log(`  호출: gh ${args.join(' ')}`);
  if (blockers.length > 0) {
    console.log('  기록하지 않습니다:');
    for (const blocker of blockers) console.log(`    - ${blocker}`);
    return false;
  }
  if (options.dryRun) {
    console.log('  --dry-run: 조건을 모두 만족합니다. 호출하지 않았습니다.');
    return true;
  }
  const reason = await exec('gh', args);
  if (reason) {
    console.log(`  기록 실패: ${reason}`);
    return false;
  }
  console.log('  기록했습니다.');
  return true;
}

async function main() {
  const expected = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  if (process.versions.node.split('.')[0] !== expected) {
    warn(`Node ${process.versions.node}로 실행 중입니다. 기준은 .nvmrc의 ${expected}입니다.`);
  }

  const startSha = git('rev-parse', 'HEAD').trim();
  const dirtyAtStart = statusPaths().length > 0;
  if (options.report && dirtyAtStart)
    warn('작업 트리가 깨끗하지 않아 끝까지 통과해도 commit status를 기록하지 않습니다.');

  if (tryGit('fetch', '--quiet', 'origin', 'main') === null) {
    warn(`origin에서 main을 받지 못해 로컬에 있는 ${BASE}로 판정합니다.`);
  }
  if (tryGit('merge-base', '--is-ancestor', BASE, 'HEAD') === null) {
    warn(`HEAD가 최신 ${BASE}를 포함하지 않습니다. CI는 병합 결과를 검사하고 ruleset은 최신 main 포함을 요구합니다.`);
  }

  const files = changedFiles();
  const code = files === null || files.some(isCodeFile);
  const kind = code ? '코드 변경' : '문서만';
  if (files === null) {
    console.log(`비교 기준(${BASE})이 없어 전체 검사를 실행합니다.`);
  } else if (code) {
    console.log(`코드 변경이 있어 전체 검사를 실행합니다:\n${files.filter(isCodeFile).join('\n')}`);
  } else {
    console.log(`문서만 바뀌어 문서 검사만 실행합니다:\n${files.join('\n')}`);
  }

  if (code) await codePath();
  else await docsPath();

  const { failed, line } = summarize(kind);
  const reported = options.report ? await reportStatus({ failed, kind, startSha, dirtyAtStart }) : true;
  console.log(`\n${line}${reported ? '' : ' (commit status 기록 안 함)'}`);
  if (signalExitCode !== undefined) return signalExitCode;
  return failed.length > 0 || !reported ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`pnpm ci:local 실행 실패: ${error.stack ?? error.message}`);
    process.exit(signalExitCode ?? 1);
  },
);
