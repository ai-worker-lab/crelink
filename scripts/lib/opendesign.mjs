// 로컬 OpenDesign의 od CLI를 찾아 실행합니다. 기준 문서: design/docs/opendesign.md
// macOS에서는 셸의 `od`가 시스템 8진수 덤프 명령(/usr/bin/od)이므로 PATH의 od를 쓰지 않습니다.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

const DEFAULT_APP = '/Applications/Open Design.app';
/** 데스크톱 앱(release-stable)의 데이터 폴더. OpenDesign 내부 경로이므로 OD_DATA_DIR로 덮어쓸 수 있습니다. */
const DEFAULT_DATA_DIR = join(homedir(), 'Library/Application Support/Open Design/namespaces/release-stable/data');
/** od CLI 종료 코드 3은 데몬에 닿지 못했다는 뜻입니다(`od lint --help`). */
const UNREACHABLE = 3;

/**
 * od CLI 실행 방법을 찾습니다. 우선순위:
 * 1. OpenDesign이 에이전트 실행 시 넣어 주는 OD_NODE_BIN·OD_BIN
 * 2. 데스크톱 앱(OPEN_DESIGN_APP, 기본 /Applications/Open Design.app)의 내장 런타임과 daemon-cli
 * @returns {{ command: string, args: string[], env: Record<string, string> } | null}
 */
export function findOpenDesignCli() {
  if (process.env.OD_NODE_BIN && process.env.OD_BIN) {
    return { command: process.env.OD_NODE_BIN, args: [process.env.OD_BIN], env: {} };
  }
  const app = process.env.OPEN_DESIGN_APP || DEFAULT_APP;
  const helper = join(app, 'Contents/Frameworks/Open Design Helper.app/Contents/MacOS/Open Design Helper');
  const cli = join(app, 'Contents/Resources/app/prebundled/daemon/daemon-cli.mjs');
  if (existsSync(helper) && existsSync(cli))
    return { command: helper, args: [cli], env: { ELECTRON_RUN_AS_NODE: '1' } };
  return null;
}

/** OpenDesign 데이터 폴더(OD_DATA_DIR 또는 데스크톱 앱 기본값). 없으면 null. */
export function openDesignDataDir() {
  const dir = process.env.OD_DATA_DIR || DEFAULT_DATA_DIR;
  return existsSync(dir) ? dir : null;
}

/** 실행 중인 데스크톱 데몬의 sidecar 소켓 후보입니다. OD_DAEMON_URL이 있으면 그 주소만 씁니다. */
function daemonEndpoints() {
  if (process.env.OD_DAEMON_URL) return [{}];
  const dir = join(tmpdir(), `od-sidecar-${userInfo().uid}`);
  const sockets = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.sock'))
        .map((name) => ({ OD_SIDECAR_CLIENT_ENDPOINT: join(dir, name) }))
    : [];
  return [...sockets, {}];
}

/**
 * od 명령을 실행합니다. 데몬 소켓을 차례로 시도하고, 닿지 않으면(종료 코드 3) 다음 후보로 넘어갑니다.
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, stderr: string, reachable: boolean } | null} CLI가 없으면 null
 */
export function runOpenDesign(args) {
  const cli = findOpenDesignCli();
  if (!cli) return null;
  let last;
  for (const endpoint of daemonEndpoints()) {
    last = spawnSync(cli.command, [...cli.args, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...cli.env, ...endpoint },
      maxBuffer: 64 * 1024 * 1024,
    });
    if (last.status !== UNREACHABLE && !/ECONNREFUSED|failed to reach daemon/.test(last.stderr + last.stdout)) {
      return { status: last.status, stdout: last.stdout, stderr: last.stderr, reachable: true };
    }
  }
  return { status: last.status, stdout: last.stdout, stderr: last.stderr, reachable: false };
}

/**
 * 실행 중인 데몬의 HTTP 주소. OD_DAEMON_URL, 없으면 Open Design 프로세스가 듣는 로컬 포트 중
 * `/api/design-systems`에 응답하는 주소(데스크톱 앱은 실행마다 포트가 바뀜). 못 찾으면 null.
 * @returns {Promise<string | null>}
 */
export async function findDaemonUrl() {
  if (process.env.OD_DAEMON_URL) return process.env.OD_DAEMON_URL.replace(/\/$/, '');
  const lsof = spawnSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-c', 'Open Design'], { encoding: 'utf8' });
  const ports = new Set([...(lsof.stdout ?? '').matchAll(/127\.0\.0\.1:(\d+) \(LISTEN\)/g)].map((match) => match[1]));
  for (const port of ports) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const response = await fetch(`${url}/api/design-systems`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && Array.isArray((await response.json()).designSystems)) return url;
    } catch {
      // 다른 앱 포트(웹 UI 등)는 건너뜁니다.
    }
  }
  return null;
}

/**
 * 디자인 시스템을 프로젝트에서 쓰려면 Workspace에 묶여야 합니다. OD_WORKSPACE_ID·OD_WORKSPACE_MEMBER_ID,
 * 없으면 기존 프로젝트(`od project list`)의 Workspace와 만든 멤버를 씁니다. 찾지 못하면 null.
 * @returns {{ workspaceId: string, memberId: string } | null}
 */
export function openDesignWorkspace() {
  if (process.env.OD_WORKSPACE_ID && process.env.OD_WORKSPACE_MEMBER_ID)
    return { workspaceId: process.env.OD_WORKSPACE_ID, memberId: process.env.OD_WORKSPACE_MEMBER_ID };
  const result = runOpenDesign(['project', 'list', '--json']);
  if (!result?.reachable || result.status !== 0) return null;
  // 프로젝트가 많으면 CLI 출력이 잘릴 수 있어 JSON 전체를 파싱하지 않고 첫 프로젝트의 두 값만 읽습니다.
  const workspaceId = /"workspaceId":\s*"([^"]+)"/.exec(result.stdout)?.[1];
  const memberId = /"createdByWorkspaceMemberId":\s*"([^"]+)"/.exec(result.stdout)?.[1];
  return workspaceId && memberId ? { workspaceId, memberId } : null;
}
