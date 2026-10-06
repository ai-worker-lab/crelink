#!/usr/bin/env node
// WORKFLOW.md에 따라 착수 가능한 work item마다 git worktree를 만들고 코딩 에이전트를 실행합니다.
// 개념·설정·운영은 docs/development/agent-runner.md, 결정은 docs/adr/0007-repository-work-item-runner.md가 기준입니다.
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadWorkflow, renderPrompt } from './lib/runner-workflow.mjs';
import {
  branchItemId,
  findWorkItemFile,
  loadWorkItems,
  rankWorkItems,
  readClaims,
  WORK_BRANCH_PREFIX,
} from './lib/work-items.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = join(root, '.local/runner');
const files = {
  events: join(stateDir, 'events.jsonl'),
  lock: join(stateDir, 'runner.json'),
  schedules: join(stateDir, 'schedules.json'),
};
// 실행기를 띄운 checkout의 인스턴스 값이 다른 worktree의 에이전트에 새지 않게 지웁니다(키는 scripts/lib/instance.mjs 기준).
const INSTANCE_KEYS = new Set([
  'INSTANCE_NAME',
  'PORT_SLOT',
  'COMPOSE_PROJECT_NAME',
  'API_PORT',
  'WEB_PORT',
  'EXPO_PORT',
  'POSTGRES_PORT',
  'VALKEY_PORT',
  'PORT',
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'API_INTERNAL_URL',
  'EXPO_PUBLIC_API_BASE_URL',
  'API_URL',
  'WEB_URL',
  'SHORT_LINK_BASE_URL',
]);
const LABELS = {
  start: '실행기 시작',
  resume: '재개 후보',
  dispatch: '착수',
  schedule: '주기 작업 시작',
  skip: '건너뜀',
  agent_start: '에이전트 시작',
  hook_failed: '훅 실패',
  timeout: '제한 시간 초과',
  retry: '재시도 예약',
  handoff: '인계',
  failed: '실패',
  stop: '중단 요청',
  stopped: '중단됨',
  interrupted: '실행기 종료로 중단',
  schedule_done: '주기 작업 종료',
  workflow_error: 'WORKFLOW 오류',
  work_items_invalid: 'work item 규칙 위반',
  tick_error: 'tick 오류',
  shutdown: '실행기 종료',
};

const USAGE = [
  '사용법: pnpm work:run [--once] [--dry-run] [--workflow <path>]',
  '        pnpm work:run --print-prompt [NNNN] [--workflow <path>]',
  '  --once          한 번 판단하고, 그때 시작한 작업과 재시도가 끝나면 종료',
  '  --dry-run       재개·착수·주기 작업 결정만 출력. 파일·브랜치·worktree를 만들지 않음',
  '  --print-prompt  에이전트를 실행하지 않고 NNNN(생략하면 다음 착수 항목)의 프롬프트를 stdout으로 출력',
  '  --workflow      다른 WORKFLOW 파일 사용(기본 WORKFLOW.md)',
].join('\n');
let options;
let positionals;
try {
  ({ values: options, positionals } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: {
      once: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'print-prompt': { type: 'boolean' },
      workflow: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  }));
  if (options['print-prompt']) {
    if (options.once || options['dry-run'])
      throw new Error('--print-prompt는 실행하지 않는 미리보기라 --once·--dry-run과 함께 쓰지 않습니다');
    if (positionals.length > 1 || (positionals[0] && !/^\d{4}$/.test(positionals[0])))
      throw new Error(`--print-prompt 뒤에는 work item 번호(NNNN) 하나만 받습니다: ${positionals.join(' ')}`);
  } else if (positionals.length > 0) {
    throw new Error(`알 수 없는 인자 '${positionals.join(' ')}'입니다. 번호는 --print-prompt와 함께 씁니다`);
  }
} catch (error) {
  console.error(`인자 오류: ${error.message}\n${USAGE}`);
  process.exit(2);
}
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
const dryRun = Boolean(options['dry-run']);
const once = Boolean(options.once);
const workflowPath = resolve(options.workflow ?? join(root, 'WORKFLOW.md'));

/** @type {Map<string, any>} 실행 중인 시도(work item 번호 또는 주기 작업 이름 → 시도) */
const running = new Map();
/** @type {Map<string, any>} 재시도·재개 대기열 */
const retries = new Map();
const notices = new Map();
let workflow;
let shuttingDown = false;
let wakeUp = () => {};

function emit(event, item, attempt, detail = {}) {
  const ts = new Date().toISOString();
  if (!dryRun) {
    appendFileSync(
      files.events,
      `${JSON.stringify({ ts, event, item: item ?? null, attempt: attempt ?? null, detail })}\n`,
    );
  }
  const fields = Object.entries(detail).map(
    ([key, value]) =>
      `${key}=${(typeof value === 'string' ? value : JSON.stringify(value)).replace(/\s*\n\s*/g, ' | ')}`,
  );
  const time = new Date().toTimeString().slice(0, 8);
  const head = [time, dryRun && '[dry-run]', LABELS[event] ?? event, item, attempt && `#${attempt}`];
  console.log([...head.filter(Boolean), ...fields].join(' '));
}

// 같은 경고를 tick마다 반복하지 않습니다. 조건이 풀리면 clearNotice로 지웁니다.
function notice(event, item, detail) {
  const key = `${event}:${item ?? ''}`;
  const text = JSON.stringify(detail);
  if (notices.get(key) === text) return;
  notices.set(key, text);
  emit(event, item, undefined, detail);
}
const clearNotice = (event, item) => notices.delete(`${event}:${item ?? ''}`);

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitSucceeds = (...args) => {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
};
const firstLine = (error) => (error.stderr?.toString().trim() || error.message).split('\n')[0];
const relativeLog = (key) => relative(root, join(stateDir, 'logs', `${key}.log`));

/** 기준 checkout을 뺀 worktree 목록: 브랜치 → 경로 */
function worktrees() {
  const top = git('rev-parse', '--show-toplevel');
  const map = new Map();
  let path;
  for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
    else if (line.startsWith('branch refs/heads/') && path !== top)
      map.set(line.slice('branch refs/heads/'.length), path);
  }
  return map;
}

/** worktree의 work item 상태. 에이전트가 역할·단계를 바꿔 파일을 옮겼으면(pnpm work:place) 번호로 찾습니다. */
function readState(workspace, item, trackerDir) {
  const path = join(workspace, item.path);
  const dir = join(workspace, trackerDir);
  const file = existsSync(path) ? path : existsSync(dir) ? findWorkItemFile(dir, item.id) : undefined;
  if (!file) return undefined;
  return /^- 상태:\s*(.+?)\s*$/m.exec(readFileSync(file, 'utf8'))?.[1];
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// 에이전트는 자기 프로세스 그룹(detached)에서 돌므로 그룹 전체에 신호를 보냅니다. SIGTERM 뒤 10초가 지나면 SIGKILL합니다.
function killGroup(child, first = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      // 이미 끝난 프로세스 그룹입니다.
    }
  };
  signal(first);
  if (first !== 'SIGKILL') setTimeout(() => signal('SIGKILL'), 10_000).unref();
}

function saveLock() {
  if (dryRun) return;
  const agents = Object.fromEntries(
    [...running.values()].filter((entry) => entry.child).map((entry) => [entry.key, entry.child.pid]),
  );
  writeFileSync(files.lock, `${JSON.stringify({ pid: process.pid, agents }, null, 2)}\n`);
}

function checkLock() {
  if (!existsSync(files.lock)) return;
  let lock;
  try {
    lock = JSON.parse(readFileSync(files.lock, 'utf8'));
  } catch {
    return;
  }
  const where = relative(process.cwd(), files.lock);
  if (lock.pid && lock.pid !== process.pid && alive(lock.pid)) {
    console.error(`이 checkout에서 실행기(pid ${lock.pid})가 이미 실행 중입니다.`);
    console.error(`그 실행기를 Ctrl+C로 멈추거나, 다른 프로세스라면 ${where}를 지우고 다시 실행하세요.`);
    process.exit(1);
  }
  const orphans = Object.entries(lock.agents ?? {}).filter(([, pid]) => alive(-pid));
  if (orphans.length > 0) {
    console.error(`이전 실행기가 남긴 에이전트 프로세스 그룹이 아직 실행 중입니다:`);
    for (const [key, pid] of orphans) console.error(`- ${key}: kill -TERM -${pid}`);
    console.error('같은 작업을 두 에이전트가 동시에 하지 않도록, 위 명령으로 멈춘 뒤 다시 실행하세요.');
    process.exit(1);
  }
}

function childEnv(extra) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (INSTANCE_KEYS.has(key) || key.startsWith('npm_') || key === 'INIT_CWD' || key === 'PNPM_SCRIPT_SRC_DIR')
      continue;
    env[key] = value;
  }
  // pnpm이 앞에 붙인 기준 checkout의 node_modules/.bin을 빼서 worktree 자신의 도구를 쓰게 합니다.
  env.PATH = (process.env.PATH ?? '')
    .split(':')
    .filter((dir) => !dir.startsWith(join(root, 'node_modules')))
    .join(':');
  return { ...env, ...extra };
}

/** 시도가 쓸 worktree 경로. 작업 브랜치의 worktree가 있으면 그 경로, 없으면 새로 만들 경로입니다. */
function workspaceFor(entry, config) {
  const existing = worktrees().get(entry.branch);
  return { path: existing ?? join(config.workspace.root, entry.dirName), exists: Boolean(existing) };
}

function prepareWorkspace(entry, config) {
  const { path, exists } = workspaceFor(entry, config);
  if (exists) return { path, created: false };
  mkdirSync(config.workspace.root, { recursive: true });
  const hasBranch = gitSucceeds('show-ref', '--verify', '--quiet', `refs/heads/${entry.branch}`);
  git('worktree', 'add', ...(hasBranch ? [path, entry.branch] : ['-b', entry.branch, path, config.workspace.base]));
  return { path, created: true };
}

/** 시도의 프롬프트. work item은 WORKFLOW.md 본문, 주기 작업은 prompt_file을 렌더링합니다. */
function renderJobPrompt(entry, workspacePath) {
  const { config, template } = workflow;
  const vars = { attempt: entry.attempt, branch: entry.branch, base: config.workspace.base, workspace: workspacePath };
  return entry.item
    ? renderPrompt(template, { ...vars, item: entry.item, push: config.workspace.push })
    : renderPrompt(readFileSync(join(root, entry.schedule.prompt_file), 'utf8'), {
        ...vars,
        schedule: entry.schedule,
      });
}

function runShell(entry, step, command, cwd, env, log, timeoutSeconds) {
  writeSync(log, `\n=== ${new Date().toISOString()} ${step} (시도 ${entry.attempt}, ${cwd}) ===\n`);
  return new Promise((settle) => {
    const child = spawn('sh', ['-c', command], { cwd, env, detached: true, stdio: ['ignore', log, log] });
    entry.child = child;
    saveLock();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, timeoutSeconds * 1000);
    const done = (code, signal) => {
      clearTimeout(timer);
      entry.child = undefined;
      saveLock();
      settle({ code, signal, timedOut });
    };
    child.once('error', (error) => {
      writeSync(log, `${error.message}\n`);
      done(null, null);
    });
    child.once('exit', done);
  });
}

async function runAttempt(entry) {
  const { config } = workflow;
  const { key, attempt } = entry;
  const log = openSync(join(stateDir, 'logs', `${key}.log`), 'a');
  const halted = () => entry.stopping || shuttingDown;
  try {
    let workspace;
    try {
      workspace = prepareWorkspace(entry, config);
    } catch (error) {
      emit('failed', key, attempt, { reason: 'worktree를 준비하지 못했습니다', message: firstLine(error) });
      return;
    }
    entry.workspace = workspace.path;
    const promptFile = join(stateDir, 'prompts', `${key}-${attempt}.md`);
    const env = childEnv({
      WORK_ITEM_ID: entry.item?.id ?? '',
      WORK_ITEM_FILE: entry.item?.path ?? '',
      WORK_ROLE: entry.item?.role ?? entry.schedule.role,
      WORK_SCHEDULE: entry.schedule?.name ?? '',
      WORK_PROMPT_FILE: promptFile,
      WORK_ATTEMPT: String(attempt),
      WORK_BRANCH: entry.branch,
      WORK_TIMEOUT_MINUTES: String(config.agent.timeout_minutes),
    });

    for (const hook of [workspace.created && 'after_create', 'before_run']) {
      if (!hook || !config.hooks[hook]) continue;
      const result = await runShell(
        entry,
        hook,
        config.hooks[hook],
        workspace.path,
        env,
        log,
        config.hooks.timeout_seconds,
      );
      if (halted()) return finish(entry, result);
      if (result.code !== 0) {
        const detail = { hook, exit: result.code ?? result.signal, timed_out: result.timedOut, log: relativeLog(key) };
        emit('failed', key, attempt, { reason: `${hook} 훅이 실패했습니다`, ...detail });
        return;
      }
    }

    let prompt;
    try {
      prompt = renderJobPrompt(entry, workspace.path);
    } catch (error) {
      emit('failed', key, attempt, { reason: '프롬프트를 렌더링하지 못했습니다', message: error.message });
      return;
    }
    writeFileSync(promptFile, `${prompt}\n`);

    emit('agent_start', key, attempt, { workspace: workspace.path, log: relativeLog(key) });
    const result = await runShell(
      entry,
      'agent',
      config.agent.command,
      workspace.path,
      env,
      log,
      config.agent.timeout_minutes * 60,
    );
    if (result.timedOut) emit('timeout', key, attempt, { minutes: config.agent.timeout_minutes });
    if (config.hooks.after_run && !shuttingDown) {
      const hookTimeout = config.hooks.timeout_seconds;
      const after = await runShell(entry, 'after_run', config.hooks.after_run, workspace.path, env, log, hookTimeout);
      if (after.code !== 0) emit('hook_failed', key, attempt, { hook: 'after_run', exit: after.code ?? after.signal });
    }
    finish(entry, result);
  } finally {
    closeSync(log);
    running.delete(key);
    saveLock();
    wakeUp();
  }
}

// 에이전트가 끝난 뒤 worktree의 work item 상태로 다음 단계를 정합니다.
function finish(entry, result) {
  const { config } = workflow;
  const { key, attempt, branch } = entry;
  const exit = result.code ?? result.signal;
  if (entry.stopping) return emit('stopped', key, attempt, { reason: entry.stopping });
  if (shuttingDown) return emit('interrupted', key, attempt, { branch });
  if (entry.schedule) return emit('schedule_done', key, attempt, { exit, branch });
  const state = readState(entry.workspace, entry.item, config.tracker.dir);
  if (!state) {
    return emit('failed', key, attempt, { reason: `worktree의 ${entry.item.path}에서 상태를 읽지 못했습니다`, exit });
  }
  if (!config.tracker.active_states.includes(state)) return emit('handoff', key, attempt, { state, exit, branch });
  if (attempt >= config.agent.max_attempts) {
    return emit('failed', key, attempt, { reason: `${attempt}회 시도 뒤에도 상태가 ${state}입니다`, exit, branch });
  }
  const delay = config.agent.backoff_seconds * 2 ** (attempt - 1);
  retries.set(key, {
    key,
    item: entry.item,
    attempt: attempt + 1,
    branch,
    dirName: entry.dirName,
    dueAt: Date.now() + delay * 1000,
  });
  emit('retry', key, attempt + 1, { delay_seconds: delay, state, exit });
}

function start(job) {
  const entry = { ...job, child: undefined, stopping: undefined };
  running.set(job.key, entry);
  if (!dryRun) entry.done = runAttempt(entry);
}

// 기준 checkout에서 멈춤 상태가 되거나 삭제된 work item의 에이전트를 멈춥니다.
function reconcile(items, config) {
  const stopReason = (id) => {
    const item = items.get(id);
    if (!item) return '기준 checkout에서 work item이 삭제되었습니다';
    if (config.tracker.stop_states.includes(item.state)) return `기준 checkout의 상태가 ${item.state}입니다`;
  };
  for (const entry of running.values()) {
    const reason = entry.item && !entry.stopping && stopReason(entry.key);
    if (!reason) continue;
    entry.stopping = reason;
    emit('stop', entry.key, entry.attempt, { reason });
    killGroup(entry.child);
  }
  for (const job of retries.values()) {
    const reason = job.item && stopReason(job.key);
    if (!reason) continue;
    retries.delete(job.key);
    emit('stopped', job.key, job.attempt, { reason });
  }
}

// 재시작 복구: 점유 브랜치의 worktree가 있고 그 안의 상태가 active면 재개 대기열에 넣습니다.
function recover(config) {
  const { items } = loadWorkItems({ root, workDir: join(root, config.tracker.dir) });
  for (const [branch, path] of worktrees()) {
    const item = items.get(branchItemId(branch));
    if (!item || config.tracker.stop_states.includes(item.state)) continue;
    const state = readState(path, item, config.tracker.dir);
    if (!config.tracker.active_states.includes(state)) continue;
    retries.set(item.id, { key: item.id, item, attempt: 1, branch, dirName: basename(path), dueAt: 0 });
    emit('resume', item.id, 1, { branch, workspace: path, state });
  }
}

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('');
}

function runSchedules(config, free) {
  const last = existsSync(files.schedules) ? JSON.parse(readFileSync(files.schedules, 'utf8')) : {};
  for (const [name, schedule] of Object.entries(config.schedules)) {
    if (free() <= 0) return;
    // 기록이 없으면 지금을 기준 시각으로 남기고 간격이 지난 뒤 처음 실행합니다.
    if (!last[name]) {
      if (!dryRun) {
        last[name] = new Date().toISOString();
        writeFileSync(files.schedules, `${JSON.stringify(last, null, 2)}\n`);
      }
      continue;
    }
    if (running.has(name) || Date.now() - Date.parse(last[name]) < schedule.interval_hours * 3_600_000) continue;
    const dirName = `${name}-${today()}`;
    const branch = `${WORK_BRANCH_PREFIX}${dirName}`;
    emit('schedule', name, 1, { branch, last_run: last[name] ?? '없음', prompt: schedule.prompt_file });
    if (!dryRun) {
      last[name] = new Date().toISOString();
      writeFileSync(files.schedules, `${JSON.stringify(last, null, 2)}\n`);
    }
    start({ key: name, schedule: { name, ...schedule }, attempt: 1, branch, dirName });
  }
}

function reloadWorkflow() {
  try {
    workflow = loadWorkflow(workflowPath, root);
    clearNotice('workflow_error');
  } catch (error) {
    notice('workflow_error', undefined, { message: error.message, using: '마지막 정상 설정' });
  }
}

function tick(dispatchNew) {
  reloadWorkflow();
  const { config } = workflow;
  const { items, children, errors } = loadWorkItems({ root, workDir: join(root, config.tracker.dir) });
  reconcile(items, config);
  const free = () => config.agent.max_concurrent - running.size;

  for (const job of [...retries.values()].sort((a, b) => a.dueAt - b.dueAt)) {
    if (job.dueAt > Date.now() || free() <= 0) continue;
    retries.delete(job.key);
    start({ ...job, item: items.get(job.key) ?? job.item });
  }
  if (!dispatchNew) return;

  if (errors.length > 0) {
    notice('work_items_invalid', undefined, { count: errors.length, fix: 'pnpm work:check', dispatch: '보류' });
  } else {
    clearNotice('work_items_invalid');
    const claims = readClaims(root);
    for (const { item, reasons } of rankWorkItems({ items, children }, claims)) {
      if (free() <= 0) break;
      if (reasons.length > 0 || running.has(item.id) || retries.has(item.id)) continue;
      const reason = baseSkipReason(item, config);
      if (reason) {
        notice('skip', item.id, { reason });
        continue;
      }
      const job = dispatchJob(item);
      const workspace = join(config.workspace.root, job.dirName);
      emit('dispatch', item.id, 1, { branch: job.branch, workspace, role: item.role });
      start(job);
    }
  }
  runSchedules(config, free);
}

function sleep() {
  const hasSlot = workflow.config.agent.max_concurrent - running.size > 0;
  const nextRetry = hasSlot ? Math.min(...[...retries.values()].map((job) => job.dueAt)) : Infinity;
  const ms = Math.max(0, Math.min(workflow.config.polling.interval_seconds * 1000, nextRetry - Date.now()));
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    wakeUp = () => {
      clearTimeout(timer);
      done();
    };
  });
}

function shutdown(signal) {
  if (shuttingDown) {
    for (const entry of running.values()) killGroup(entry.child, 'SIGKILL');
    process.exit(130);
  }
  shuttingDown = true;
  emit('shutdown', undefined, undefined, { signal, running: running.size });
  for (const entry of running.values()) killGroup(entry.child);
  wakeUp();
}

/** 새 착수의 시도 정보. 작업 브랜치·worktree 디렉터리 이름은 work item 파일 이름입니다. */
function dispatchJob(item) {
  const dirName = basename(item.path, '.md');
  return { key: item.id, item, attempt: 1, branch: `${WORK_BRANCH_PREFIX}${dirName}`, dirName };
}

/** worktree는 workspace.base에서 만들므로 work item이 그 ref에 커밋되어 있어야 합니다. 아니면 건너뛸 사유입니다. */
function baseSkipReason(item, config) {
  if (gitSucceeds('cat-file', '-e', `${config.workspace.base}:${item.path}`)) return undefined;
  return `${config.workspace.base}에서 ${item.path}를 찾지 못했습니다. work item을 커밋하고 workspace.base를 확인하세요`;
}

// --print-prompt: 착수·재개 때와 같은 규칙으로 프롬프트만 렌더링합니다. 훅·에이전트를 실행하지 않고
// 브랜치·worktree·.local/runner/를 만들지 않습니다. 번호가 없으면 tick이 새로 착수할 첫 항목을 고릅니다.
function previewPrompt(id) {
  const { config } = workflow;
  const { items, children, errors } = loadWorkItems({ root, workDir: join(root, config.tracker.dir) });
  const ranked = rankWorkItems({ items, children }, readClaims(root));
  let job;
  if (id) {
    const item = items.get(id);
    if (!item) {
      throw new Error(
        `work item ${id}이 ${config.tracker.dir}에 없습니다. 번호를 확인하거나 pnpm work:next --all로 목록을 보세요.`,
      );
    }
    // 재개(recover)와 같이 이 번호의 작업 브랜치 worktree가 있으면 그 브랜치·경로를 씁니다.
    const resumed = [...worktrees()].find(([branch]) => branchItemId(branch) === id);
    if (resumed) {
      job = { key: id, item, attempt: 1, branch: resumed[0], dirName: basename(resumed[1]) };
      console.error(`참고: ${id}의 worktree ${resumed[1]}(브랜치 ${resumed[0]})가 있어 재개 때의 값으로 렌더링합니다.`);
    } else {
      job = dispatchJob(item);
      const reasons = [...ranked.find((row) => row.item.id === id).reasons, baseSkipReason(item, config)].filter(
        Boolean,
      );
      if (reasons.length > 0) console.error(`참고: 지금은 실행기가 착수하지 않는 항목입니다(${reasons.join('; ')}).`);
    }
  } else {
    if (errors.length > 0) {
      throw new Error(
        `work item 규칙 위반 ${errors.length}건이 있어 실행기가 새 착수를 보류합니다. pnpm work:check로 확인해 고치세요.`,
      );
    }
    const next = ranked.find(({ item, reasons }) => reasons.length === 0 && !baseSkipReason(item, config));
    if (!next) {
      throw new Error(
        '착수 가능한 work item이 없습니다. pnpm work:next --all로 제외 사유를 보거나, pnpm work:run --print-prompt NNNN으로 특정 항목의 프롬프트를 보세요.',
      );
    }
    job = dispatchJob(next.item);
    console.error(`다음 착수 항목: ${next.item.id} ${next.item.title ?? ''}`.trimEnd());
  }
  try {
    return `${renderJobPrompt(job, workspaceFor(job, config).path)}\n`;
  } catch (error) {
    throw new Error(`프롬프트를 렌더링하지 못했습니다: ${error.message}. ${job.item.path}의 제목·필드를 확인하세요.`);
  }
}

try {
  workflow = loadWorkflow(workflowPath, root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (options['print-prompt']) {
  let text;
  try {
    text = previewPrompt(positionals[0]);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  // 파이프로 넘길 때 출력이 잘리지 않도록 쓰기가 끝난 뒤 종료합니다.
  await new Promise((done) => process.stdout.write(text, done));
  process.exit(0);
}
if (!dryRun) {
  for (const dir of ['logs', 'prompts']) mkdirSync(join(stateDir, dir), { recursive: true });
  checkLock();
  saveLock();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const { config } = workflow;
emit('start', undefined, undefined, {
  workflow: options.workflow ?? 'WORKFLOW.md',
  mode: dryRun ? 'dry-run' : once ? 'once' : 'loop',
  workspace_root: config.workspace.root,
  max_concurrent: config.agent.max_concurrent,
});
recover(config);
for (let first = true; !shuttingDown; first = false) {
  try {
    tick(first || !once);
  } catch (error) {
    emit('tick_error', undefined, undefined, { message: firstLine(error) });
  }
  if (dryRun || (once && running.size === 0 && retries.size === 0)) break;
  await sleep();
}
await Promise.all([...running.values()].map((entry) => entry.done));
if (!dryRun) rmSync(files.lock, { force: true });
process.exit(shuttingDown ? 130 : 0);
