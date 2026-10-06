// WORKFLOW.md(YAML front matter + 프롬프트 본문)를 읽어 기본값을 채우고 검증합니다.
// 설정 키의 설명은 docs/development/agent-runner.md가 기준입니다.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { loadAgents } from './agents.mjs';
import { STATES } from './work-items.mjs';

const PROMPT_VARS = [
  'item.id',
  'item.title',
  'item.path',
  'item.role',
  'item.state',
  'item.priority',
  'item.kind',
  'item.level',
  'attempt',
  'branch',
  'base',
  'workspace',
  'push',
];

/** `workspace.base`를 생략했을 때의 기준 브랜치. `pnpm work:scope`의 기본 기준도 같은 값을 씁니다. */
const DEFAULT_BASE = 'main';

/** WORKFLOW.md를 front matter 객체와 프롬프트 본문으로 나눕니다. */
function readWorkflowFile(path) {
  if (!existsSync(path))
    throw new Error(`${path}가 없습니다. 루트 WORKFLOW.md를 만들거나 --workflow <path>로 지정하세요.`);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(readFileSync(path, 'utf8'));
  if (!match) throw new Error(`${path}: 첫 줄부터 --- 로 감싼 YAML front matter가 필요합니다.`);
  let raw;
  try {
    raw = parse(match[1]) ?? {};
  } catch (error) {
    throw new Error(`${path}: YAML front matter를 해석할 수 없습니다. ${error.message.split('\n')[0]}`);
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path}: front matter는 키-값 객체여야 합니다.`);
  return { raw, body: match[2] };
}

/**
 * 작업 브랜치의 기준 브랜치(`workspace.base`)만 읽습니다. WORKFLOW.md가 없으면 기본값입니다.
 * 실행기 설정 전체를 검증하지 않으므로 실행기 밖의 도구(`pnpm work:scope`)가 씁니다.
 * @param {string} root checkout 루트
 */
export function readWorkspaceBase(root) {
  const path = join(root, 'WORKFLOW.md');
  if (!existsSync(path)) return DEFAULT_BASE;
  const base = readWorkflowFile(path).raw.workspace?.base ?? DEFAULT_BASE;
  if (typeof base !== 'string' || base.trim() === '')
    throw new Error(`${path}: workspace.base는 비어 있지 않은 문자열이어야 합니다. 예: base: main`);
  return base;
}

/**
 * @param {string} path WORKFLOW.md 경로
 * @param {string} root 실행기를 띄운 checkout 루트
 */
export function loadWorkflow(path, root) {
  const { raw, body } = readWorkflowFile(path);

  const problems = [];
  const section = (name) => {
    const value = raw[name] ?? {};
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) return value;
    problems.push(`${name}는 키-값 객체여야 합니다`);
    return {};
  };
  const integer = (obj, name, fallback) => {
    const value = obj[name.split('.').pop()] ?? fallback;
    if (!Number.isInteger(value) || value < 1) problems.push(`${name}는 1 이상의 정수여야 합니다 (현재 ${value})`);
    return value;
  };
  const text = (obj, name, fallback, optional = false) => {
    const value = obj[name.split('.').pop()] ?? fallback;
    if (optional && value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim() === '') problems.push(`${name}는 비어 있지 않은 문자열이어야 합니다`);
    return value;
  };
  const states = (obj, name, fallback) => {
    const value = obj[name.split('.').pop()] ?? fallback;
    if (!Array.isArray(value) || value.some((state) => !STATES.includes(state)))
      problems.push(`${name}는 상태 목록이어야 합니다. 허용 값: ${STATES.join(', ')}`);
    return value;
  };

  const tracker = section('tracker');
  const polling = section('polling');
  const workspace = section('workspace');
  const hooks = section('hooks');
  const agent = section('agent');
  const config = {
    tracker: {
      dir: text(tracker, 'tracker.dir', 'docs/work'),
      active_states: states(tracker, 'tracker.active_states', ['준비', '진행']),
      stop_states: states(tracker, 'tracker.stop_states', ['보류/종료']),
    },
    polling: { interval_seconds: integer(polling, 'polling.interval_seconds', 60) },
    workspace: {
      root: text(workspace, 'workspace.root', join('..', `${basename(root)}-worktrees`)),
      base: text(workspace, 'workspace.base', DEFAULT_BASE),
      push: workspace.push ?? false,
    },
    hooks: {
      after_create: text(hooks, 'hooks.after_create', undefined, true),
      before_run: text(hooks, 'hooks.before_run', undefined, true),
      after_run: text(hooks, 'hooks.after_run', undefined, true),
      timeout_seconds: integer(hooks, 'hooks.timeout_seconds', 1800),
    },
    agent: {
      command: text(agent, 'agent.command', undefined),
      max_concurrent: integer(agent, 'agent.max_concurrent', 1),
      timeout_minutes: integer(agent, 'agent.timeout_minutes', 60),
      max_attempts: integer(agent, 'agent.max_attempts', 3),
      backoff_seconds: integer(agent, 'agent.backoff_seconds', 60),
    },
    schedules: {},
  };
  if (typeof config.workspace.root === 'string') config.workspace.root = resolve(root, config.workspace.root);
  if (typeof config.workspace.push !== 'boolean') problems.push('workspace.push는 true 또는 false여야 합니다');
  const { active_states: active, stop_states: stop } = config.tracker;
  if (Array.isArray(active) && Array.isArray(stop) && active.some((state) => stop.includes(state)))
    problems.push('tracker.active_states와 tracker.stop_states가 겹칩니다');

  const roles = loadAgents(join(root, '.omp/agents'));
  for (const [name, value] of Object.entries(section('schedules'))) {
    const key = `schedules.${name}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) problems.push(`${key}: 이름은 소문자·숫자·하이픈만 씁니다`);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      problems.push(`${key}는 키-값 객체여야 합니다`);
      continue;
    }
    const schedule = {
      interval_hours: integer(value, `${key}.interval_hours`, undefined),
      prompt_file: text(value, `${key}.prompt_file`, undefined),
      role: text(value, `${key}.role`, 'orchestrator'),
    };
    if (typeof schedule.prompt_file === 'string' && !existsSync(join(root, schedule.prompt_file)))
      problems.push(`${key}.prompt_file ${schedule.prompt_file}가 없습니다`);
    if (!roles.has(schedule.role))
      problems.push(
        `${key}.role "${schedule.role}"가 .omp/agents에 없습니다. 허용 값: ${[...roles.keys()].join(', ')}`,
      );
    config.schedules[name] = schedule;
  }

  const template = body.trim();
  if (!template) problems.push('front matter 아래에 프롬프트 본문이 필요합니다');
  for (const [, name] of template.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!PROMPT_VARS.includes(name))
      problems.push(`프롬프트 변수 {{ ${name} }}는 없습니다. 허용 값: ${PROMPT_VARS.join(', ')}`);
  }

  if (problems.length > 0) throw new Error(`${path} 설정 오류:\n- ${problems.join('\n- ')}`);
  return { config, template };
}

/**
 * `{{ a.b }}`를 vars의 값으로 바꿉니다. 정의되지 않은 변수는 오류입니다.
 * @param {string} template
 * @param {Record<string, unknown>} vars
 */
export function renderPrompt(template, vars) {
  return template.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (_, name) => {
    const value = name.split('.').reduce((object, key) => object?.[key], vars);
    if (value === undefined || value === null) throw new Error(`프롬프트 변수 {{ ${name} }}의 값이 없습니다`);
    return String(value);
  });
}
