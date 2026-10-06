// checkout별 로컬 인스턴스 설정(.local/instance.env)을 만들고 읽습니다. 결정 배경은 docs/adr/0008-worktree-local-instances.md.
// 주 checkout은 슬롯 0(infra/local/.env.example의 포트, Compose project crelink), 연결된 worktree는 빈 슬롯 k≥1(포트 + 100×k)을 받습니다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const BASE_NAME = 'crelink';
// 슬롯 0 포트의 원본은 추적되는 이 파일입니다(개인 설정 infra/local/.env가 아님). 슬롯 k는 각 포트 + 100×k입니다.
export const BASE_PORTS_FILE = 'infra/local/.env.example';
export const PORT_KEYS = ['API_PORT', 'WEB_PORT', 'EXPO_PORT', 'POSTGRES_PORT', 'VALKEY_PORT'];
const MAX_AUTO_SLOT = 20;
const INSTANCE_FILE = '.local/instance.env';
// 없으면 추적 예시에서 만드는 로컬 설정 파일. 예시에 있는 인스턴스 키(PORT, DATABASE_URL 등)는 이 인스턴스 값으로 씁니다.
const LOCAL_FILES = [
  [BASE_PORTS_FILE, 'infra/local/.env'],
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
  ['apps/app/.env.example', 'apps/app/.env'],
];

export const INSTANCE_KEYS = [
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
];

function parseEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return env;
}

/**
 * @param {string} root checkout 루트
 * @returns {Record<string, string> | null}
 */
export function readInstanceEnv(root) {
  const path = join(root, INSTANCE_FILE);
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : null;
}

/**
 * 슬롯 0 포트를 추적되는 infra/local/.env.example에서 읽습니다.
 * @param {string} root checkout 루트
 * @returns {Record<string, number>} PORT_KEYS별 포트
 */
export function readBasePorts(root) {
  const path = join(root, BASE_PORTS_FILE);
  if (!existsSync(path)) {
    throw new Error(`슬롯 0 포트 원본 ${BASE_PORTS_FILE}이 없습니다. git checkout -- ${BASE_PORTS_FILE}로 복구하세요.`);
  }
  const env = parseEnv(readFileSync(path, 'utf8'));
  const invalid = PORT_KEYS.filter((key) => {
    const port = Number(env[key]);
    return !/^\d+$/.test(env[key] ?? '') || port < 1 || port > 65535;
  });
  if (invalid.length > 0) {
    throw new Error(
      `${BASE_PORTS_FILE}의 ${invalid.join(', ')}가 없거나 1~65535 정수가 아닙니다. 이 파일에 <키>=<포트 번호> 줄로 다섯 포트(${PORT_KEYS.join(', ')})를 모두 적으세요. 커밋된 값은 git show HEAD:${BASE_PORTS_FILE}로 볼 수 있습니다.`,
    );
  }
  return Object.fromEntries(PORT_KEYS.map((key) => [key, Number(env[key])]));
}

/**
 * 인스턴스 설정을 읽고, 없거나 키가 빠졌거나 PORT_SLOT 환경변수가 다르거나 포트가 원본(슬롯 0 포트 + 100×슬롯)과 다르면 새로 만듭니다.
 * 없는 로컬 설정 파일은 추적 예시에서 만들고 기존 파일은 덮어쓰지 않습니다.
 * @param {string} root checkout 루트
 * @returns {Record<string, string>}
 */
export function ensureInstance(root) {
  const override = process.env.PORT_SLOT || undefined;
  const basePorts = readBasePorts(root);
  let env = readInstanceEnv(root);
  // 주 checkout의 .local을 복사해 온 연결 worktree가 슬롯 0(주 인스턴스의 Compose project·포트)을 같이 쓰지 않게 다시 만듭니다.
  const copiedMain = env?.PORT_SLOT === '0' && override === undefined && !isMainCheckout(root);
  if (
    !env ||
    copiedMain ||
    INSTANCE_KEYS.some((key) => !(key in env)) ||
    (override !== undefined && override !== env.PORT_SLOT) ||
    PORT_KEYS.some((key) => env[key] !== String(basePorts[key] + 100 * Number(env.PORT_SLOT)))
  ) {
    env = createInstance(root, basePorts, override, copiedMain ? null : env);
    mkdirSync(join(root, '.local'), { recursive: true });
    writeFileSync(
      join(root, INSTANCE_FILE),
      `# pnpm instance가 만든 이 checkout의 로컬 인스턴스 설정입니다. 슬롯을 바꾸려면 PORT_SLOT=<번호> pnpm instance를 실행합니다.\n${INSTANCE_KEYS.map((key) => `${key}=${env[key]}`).join('\n')}\n`,
    );
  }
  createLocalFiles(root, env);
  return env;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function isMainCheckout(root) {
  try {
    const [gitDir, commonDir] = git(root, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'])
      .split('\n')
      .map(realpath);
    return gitDir === commonDir;
  } catch {
    return true; // git 저장소가 아니면 연결된 worktree도 없습니다.
  }
}

function otherWorktreeInstances(root) {
  const self = realpath(root);
  return git(root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => realpath(line.slice('worktree '.length)))
    .filter((path) => path && path !== self)
    .map((path) => readInstanceEnv(path))
    .filter(Boolean);
}

function parseSlot(value, basePorts) {
  const slot = Number(value);
  const maxPort = Math.max(...Object.values(basePorts)) + 100 * slot;
  if (!Number.isInteger(slot) || slot < 0 || maxPort > 65535) {
    throw new Error(
      `PORT_SLOT "${value}"은 0 이상의 정수이고 모든 포트(${BASE_PORTS_FILE}의 슬롯 0 포트 + 100×슬롯)가 65535 이하여야 합니다. 더 작은 슬롯을 지정하세요.`,
    );
  }
  return slot;
}

function createInstance(root, basePorts, override, previous) {
  const main = isMainCheckout(root);
  const others = main ? [] : otherWorktreeInstances(root);
  let slot;
  if (override !== undefined) slot = parseSlot(override, basePorts);
  else if (main) slot = 0;
  else {
    const used = new Set(others.map((other) => Number(other.PORT_SLOT)));
    slot = Array.from({ length: MAX_AUTO_SLOT }, (_, index) => index + 1).find((candidate) => !used.has(candidate));
    if (slot === undefined) {
      throw new Error(
        `연결된 worktree 슬롯 1~${MAX_AUTO_SLOT}이 모두 사용 중입니다. 쓰지 않는 worktree에서 make instance-destroy CONFIRM=1 후 git worktree remove <경로>로 정리하거나, PORT_SLOT=<번호> pnpm instance로 직접 지정하세요.`,
      );
    }
  }

  // 이름과 Compose project는 한 번 정하면 유지합니다. 바꾸면 기존 볼륨과 연결이 끊깁니다.
  let name = previous?.INSTANCE_NAME;
  if (!name) {
    const slug =
      basename(root)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'worktree';
    name = main ? 'main' : slug;
    if (!main && others.some((other) => other.INSTANCE_NAME === name)) name = `${slug}-${slot}`;
  }
  const project = previous?.COMPOSE_PROJECT_NAME ?? (main ? BASE_NAME : `${BASE_NAME}-${name}`);

  const ports = Object.fromEntries(PORT_KEYS.map((key) => [key, String(basePorts[key] + 100 * slot)]));
  const infraEnvPath = join(root, LOCAL_FILES[0][1]);
  const infraExamplePath = join(root, BASE_PORTS_FILE);
  const credentialsPath = existsSync(infraEnvPath) ? infraEnvPath : infraExamplePath;
  if (!existsSync(credentialsPath)) {
    throw new Error(
      `${LOCAL_FILES[0][0]}이 없어 DB 자격 증명을 알 수 없습니다. git checkout -- ${LOCAL_FILES[0][0]}로 복구하세요.`,
    );
  }
  const infra = parseEnv(readFileSync(credentialsPath, 'utf8'));
  const missing = ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'].filter((key) => !infra[key]);
  if (missing.length > 0) {
    throw new Error(`${credentialsPath}에 ${missing.join(', ')}가 없습니다. ${LOCAL_FILES[0][0]}을 참고해 채우세요.`);
  }
  const databaseUrl = `postgresql://${encodeURIComponent(infra.POSTGRES_USER)}:${encodeURIComponent(infra.POSTGRES_PASSWORD)}@127.0.0.1:${ports.POSTGRES_PORT}/${encodeURIComponent(infra.POSTGRES_DB)}`;
  const apiUrl = `http://127.0.0.1:${ports.API_PORT}`;
  return {
    INSTANCE_NAME: name,
    PORT_SLOT: String(slot),
    COMPOSE_PROJECT_NAME: project,
    ...ports,
    PORT: ports.API_PORT,
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    API_INTERNAL_URL: apiUrl,
    EXPO_PUBLIC_API_BASE_URL: apiUrl,
    API_URL: apiUrl,
    WEB_URL: `http://127.0.0.1:${ports.WEB_PORT}`,
  };
}

function createLocalFiles(root, env) {
  for (const [example, target] of LOCAL_FILES) {
    if (existsSync(join(root, target)) || !existsSync(join(root, example))) continue;
    const text = readFileSync(join(root, example), 'utf8').replace(/^([A-Za-z_][A-Za-z0-9_]*)=.*$/gm, (line, key) =>
      key in env ? `${key}=${env[key]}` : line,
    );
    writeFileSync(join(root, target), text, { flag: 'wx', mode: 0o600 });
    console.error(`instance: ${target}를 ${example}에서 만들었습니다(이 인스턴스의 포트·연결 값 사용).`);
  }
}
