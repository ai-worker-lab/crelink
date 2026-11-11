#!/usr/bin/env node
// CI(.github/workflows/ci.yml)의 검사를 profile별로 실행하고 성공 영수증을 report에서 재사용합니다(ADR 0016 결정 5).
// 기본 full은 origin/main 기준 문서/코드 경로를 유지하고, 좁은 profile은 registry에 등록한 관련 검사만 실행합니다.
// 이미지는 Docker 서버의 고유 플랫폼으로 빌드해 Dockerfile·의존성 오류를 잡습니다. linux/amd64 빌드는 deploy.yml이 서버를 건드리기 전에 검증합니다.
// 실패가 있어도 남은 단계를 끝까지 돌리고 필수 실패는 종료 코드 1, 사전 선언한 외부 관측 FAIL만 비차단입니다. 이 실행이 띄운 스택만 내립니다.
// --report는 저장된 성공 영수증만 대조하고 테스트 0회로 commit status `CI 통과`를 기록합니다. gh의 현재 인증(GH_TOKEN 또는 gh auth)을 씁니다.
// main ruleset의 필수 검사 `CI 통과`는 이 status로 충족합니다(0237). strict라 main보다 뒤처진 커밋은 브랜치를 갱신해 다시 실행합니다.
// 기준 문서: docs/development/verification.md#로컬-ci
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { release } from 'node:os';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  isCodeFile,
  verificationPlan,
  configEnvelope,
  CONFIG_FILE,
  makeReceipt,
  receiptBlockers,
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

let stepExecutions = [];
const exec = async (command, args, env) => {
  stepExecutions.push([command, args]);
  const { code, signal, error } = await run(command, args, env);
  if (error) return `실행 실패: ${error.message}`;
  if (signal) return `신호 ${signal}`;
  return code === 0 ? undefined : `종료 코드 ${code}`;
};

const results = [];
const warnings = [];
const skip = (step, reason) => results.push({ step, status: '건너뜀', reason, executed: [] });
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
  stepExecutions = [];
  try {
    reason = await action();
  } catch (error) {
    reason = `실행 실패: ${error.message}`;
  }
  const seconds = (Date.now() - started) / 1000;
  results.push({ step: name, status: reason ? '실패' : '통과', seconds, reason, executed: stepExecutions });
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
    return 'NO_STACK';
  }
  const reason = await exec('make', targets);
  if (started.apps.length === APP_SERVICES.length) {
    const killed = await exec('pnpm', ['exec', 'pm2', 'kill'], { ...process.env, PM2_HOME: pm2Home });
    return reason ?? killed;
  }
  return reason;
}

function summarize(kind) {
  const total = results.reduce((sum, result) => sum + (result.seconds ?? 0), 0);
  const allFailed = results.filter((result) => result.status === '실패');
  const failed = results.filter(
    (result) =>
      result.status === '실패' &&
      !activePlan.some((entry) => entry.id === result.step && entry.observation === 'external' && !entry.required),
  );
  const skipped = results.filter((result) => result.status === '건너뜀');
  console.log(`\n로컬 CI 요약 (pnpm ci:local, ${kind})`);
  for (const { step: name, status, seconds, reason } of results) {
    const time = seconds === undefined ? '' : `${seconds.toFixed(1)}s`;
    // 한글은 터미널에서 두 칸이라 이름을 앞에 두고 맞추면 줄이 어긋납니다. 폭이 일정한 시간을 앞에 둡니다.
    console.log(`  ${time.padStart(7)}  ${status}  ${name}${reason ? ` (${reason})` : ''}`);
  }
  if (kind.includes('코드 변경') && options.profile === 'full') {
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
    line: `결과: ${failed.length > 0 ? '실패' : '통과'} — 통과 ${results.length - allFailed.length - skipped.length}, 실패 ${allFailed.length}(비차단 관측 ${allFailed.length - failed.length}), 건너뜀 ${skipped.length}, 총 ${total.toFixed(1)}s`,
  };
}

/** 기록했거나 dry-run에서 조건을 모두 만족했으면 true입니다. */
async function reportStatus({ failed, kind, startSha, dirtyAtStart, receipt }) {
  const branch = tryGit('branch', '--show-current') ?? '';
  const remote = branch ? tryGit('ls-remote', '--heads', 'origin', `refs/heads/${branch}`) : null;
  const repo = repoFromRemote(tryGit('remote', 'get-url', 'origin'));
  const endSha = tryGit('rev-parse', 'HEAD');
  const receiptErrors = receiptBlockers(receipt, identityFor(options, changedFiles()), activePlan);
  const blockers = [
    ...receiptErrors,
    ...reportBlockers({
      interrupted: signalExitCode !== undefined,
      failed,
      dirtyAtStart,
      dirtyAtEnd: statusPaths().length > 0,
      startSha,
      endSha,
      branch,
      remoteSha: remote?.split(/\s/)[0] ?? '',
      repo,
    }),
  ];
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

let activePlan = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (file) => (existsSync(join(root, file)) ? hash(readFileSync(join(root, file))) : null);

function identityFor(options, files) {
  const runnerFiles = git(
    'ls-files',
    '-z',
    'scripts',
    'package.json',
    'apps/*/package.json',
    'packages/*/package.json',
    '.nvmrc',
  )
    .split('\0')
    .filter(Boolean);
  // 환경값/비밀은 저장하지 않습니다. pnpm의 호출 인자와 터미널별 volatile 값은 실행 내용이 아닙니다.
  const environment = Object.fromEntries(
    Object.entries(process.env)
      .filter(
        ([key]) =>
          ![
            '_',
            'SHLVL',
            'PWD',
            'OLDPWD',
            'INIT_CWD',
            'npm_lifecycle_event',
            'npm_lifecycle_script',
            'npm_command',
            'npm_config_argv',
            'TERM',
            'TERM_PROGRAM',
            'TERM_PROGRAM_VERSION',
            'COLOR',
            'FORCE_COLOR',
            'NO_COLOR',
            'GH_TOKEN',
            'GITHUB_TOKEN',
          ].includes(key),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const envFiles = [
    '.env',
    '.env.local',
    '.local/instance.env',
    'infra/local/.env',
    'apps/api/.env',
    'apps/web/.env',
    'apps/web/.env.local',
    'apps/app/.env',
  ];
  return {
    sha: git('rev-parse', 'HEAD').trim(),
    base: tryGit('rev-parse', BASE),
    clean: statusPaths().length === 0,
    profile: options.profile,
    selectors: options.selectors,
    qa: options.qa,
    files,
    node: process.versions.node,
    platform: { os: process.platform, arch: process.arch, release: release() },
    lock: fileHash('pnpm-lock.yaml'),
    runner: hash(JSON.stringify(runnerFiles.map((file) => [file, fileHash(file)]))),
    environment: hash(JSON.stringify([environment, envFiles.map((file) => [file, fileHash(file)])])),
  };
}

function assertEnvironment() {
  for (const key of ['EGO_TEST_ONLY', 'EGO_TEST_FAULT', 'EGO_TEST_INJECT_CSS']) {
    if (process.env[key]) throw new Error(`${key}로 필수 결과를 축소/변조할 수 없습니다.`);
  }
  if (process.env.INSTAGRAM_LIVE && process.env.INSTAGRAM_LIVE !== '1')
    throw new Error('INSTAGRAM_LIVE는 미지정 또는 1만 허용합니다.');
}

async function executePlan(plan) {
  let instance, before;
  let stackReady = true;
  const started = { infra: false, apps: [] };
  const prepare = async () => {
    instance ??= ensureInstance(root);
    before ??= await snapshotStack(instance);
  };
  try {
    for (const entry of plan) {
      if (entry.id.startsWith('ego ') && !stackReady && !interrupt.signal.aborted) {
        skip(entry.id, '스택이 준비되지 않았습니다');
        continue;
      }
      if (entry.action === 'teardown') {
        if (!instance) {
          skip(entry.id, '이 실행이 띄운 스택이 없습니다');
          continue;
        }
        // 자원 없음은 registry의 유일한 정리 건너뜀입니다. 실패는 필수 실패로 남깁니다.
        if (!started.infra && started.apps.length === 0) {
          skip(entry.id, entry.allowSkip);
          continue;
        }
      }
      const passed = await step(
        entry.id,
        async () => {
          if (entry.command) {
            if (entry.id === 'DB 시작') {
              await prepare();
              if (interrupt.signal.aborted) return '중단됨';
              started.infra = !before.infra;
            }
            return exec(entry.command, entry.args);
          }
          if (entry.action === 'instance') {
            await prepare();
            return;
          }
          if (entry.action === 'config-envelope') {
            if (changedFiles().includes(CONFIG_FILE))
              configEnvelope(git('show', `${BASE}:${CONFIG_FILE}`), readFileSync(join(root, CONFIG_FILE), 'utf8'));
            return;
          }
          if (entry.action === 'stack') {
            await prepare();
            if (interrupt.signal.aborted) return '중단됨';
            const missing = APP_SERVICES.filter((service) => !before.apps.has(service));
            const targets = missing.length === APP_SERVICES.length ? ['up'] : missing.map((service) => `${service}-up`);
            if (targets.length) {
              started.apps = missing;
              started.infra ||= !before.infra;
              const reason = await exec('make', targets);
              if (reason) return reason;
            }
            return waitForStack(instance);
          }
          if (entry.action === 'teardown') return teardown(instance, started);
          if (entry.action.startsWith('image:')) {
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
              `apps/${entry.action.slice(6)}/Dockerfile`,
              '.',
            ]);
          }
          if (entry.action === 'meta-live') {
            // 인증 성공 관측이 아닙니다. 비밀 없이 공개 Graph 호스트 도달만 별도 opt-in으로 관측합니다.
            try {
              const response = await fetch('https://graph.facebook.com/v27.0/', {
                signal: AbortSignal.any([interrupt.signal, AbortSignal.timeout(10_000)]),
              });
              await response.body?.cancel();
              return response.status >= 500 ? '외부 Graph 5xx' : undefined;
            } catch {
              return '외부 Graph 관측 불가';
            }
          }
          return '알 수 없는 registry action';
        },
        { always: entry.action === 'teardown' },
      );
      if (entry.action === 'stack') stackReady = passed;
    }
  } finally {
    // 예외/신호로 계획을 못 마쳐도 실행이 만든 자원만 정리합니다. 영수증은 완전성 대조에서 거부됩니다.
    if (instance && !results.some((result) => result.step === '스택 정리')) await teardown(instance, started);
  }
}

async function main() {
  const expected = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  if (process.versions.node.split('.')[0] !== expected)
    warn(`Node ${process.versions.node}로 실행 중입니다. 기준은 .nvmrc의 ${expected}입니다.`);
  try {
    assertEnvironment();
  } catch (error) {
    console.error(error.message);
    return options.report ? 1 : 2;
  }
  // report는 fetch/검사/스택 준비를 하지 않습니다. 원격 tip 확인·status 등록만 reportStatus에서 합니다.
  if (!options.report && tryGit('fetch', '--quiet', 'origin', 'main') === null)
    warn(`origin에서 main을 받지 못해 로컬 ${BASE}로 판정합니다.`);
  const files = changedFiles();
  const scoped = Boolean(branchItemId(tryGit('branch', '--show-current') ?? ''));
  try {
    activePlan = verificationPlan(options, files, { scoped, live: process.env.INSTAGRAM_LIVE === '1' });
    if (options.profile === 'config' && files.includes(CONFIG_FILE))
      configEnvelope(git('show', `${BASE}:${CONFIG_FILE}`), readFileSync(join(root, CONFIG_FILE), 'utf8'));
  } catch (error) {
    console.error(error.message);
    return options.report ? 1 : 2;
  }
  const kind = `${options.profile}, ${files === null || files.some(isCodeFile) ? '코드 변경' : '문서만'}`;
  console.log(
    `범위 고정: ${JSON.stringify({ profile: options.profile, selectors: options.selectors, qa: options.qa, files })}`,
  );
  console.log(`필수/관측 계획: ${JSON.stringify(activePlan)}`);
  if (!options.report)
    rmSync(join(root, '.local/ci/receipts', `${git('rev-parse', 'HEAD').trim()}.json`), { force: true });
  if (!options.report && activePlan.some((entry) => entry.action === 'instance' || entry.id === 'DB 시작'))
    ensureInstance(root);
  const identity = identityFor(options, files);
  const receiptPath = join(root, '.local/ci/receipts', `${identity.sha}.json`);
  if (options.report) {
    console.log('영수증 재사용: tests 0 (검사 명령 0회)');
    let receipt;
    try {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    } catch {
      /* 없음/손상은 거부 */
    }
    const receiptErrors = receiptBlockers(receipt, identity, activePlan);
    if (!identity.base || !identity.lock) receiptErrors.push('base/lock 불명');
    if (receiptErrors.length) {
      for (const error of receiptErrors) console.error(error);
      return 1;
    }
    // 등록 직전 HEAD/dirty/지문을 다시 확인합니다.
    return (await reportStatus({
      failed: [],
      kind,
      startSha: identity.sha,
      dirtyAtStart: !identity.clean,
      receipt,
    }))
      ? 0
      : 1;
  }
  await executePlan(activePlan);
  const { failed, line } = summarize(kind);
  const endIdentity = identityFor(options, changedFiles());
  const receipt = makeReceipt(identity, activePlan, results, signalExitCode !== undefined);
  const blockers = receiptBlockers(receipt, endIdentity, activePlan);
  if (!identity.base || !identity.lock) blockers.push('base/lock 불명');
  if (!blockers.length) {
    mkdirSync(dirname(receiptPath), { recursive: true });
    const temp = `${receiptPath}.tmp`;
    writeFileSync(temp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, receiptPath);
    console.log(`성공 영수증 저장: .local/ci/receipts/${identity.sha}.json`);
  } else console.log(`영수증 저장 거부: ${blockers.join('; ')}`);
  console.log(`\n${blockers.length ? line.replace('결과: 통과', '결과: 실패 (receipt 거부)') : line}`);
  if (signalExitCode !== undefined) return signalExitCode;
  // clean·완전성까지 만족해야 로컬 CI 성공입니다.
  return failed.length || blockers.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`pnpm ci:local 실행 실패: ${error.stack ?? error.message}`);
    process.exit(signalExitCode ?? 1);
  },
);
