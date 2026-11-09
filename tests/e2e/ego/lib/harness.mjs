// ego-lite 시험의 Node 쪽 실행기. 로컬 대상을 검사하고 시나리오를 `ego-browser nodejs`에 넘겨 종료 코드로 성패를 돌려줍니다.
// ego-browser 스크립트는 셸 환경변수와 작업 디렉터리를 물려받지 않으므로 설정 전부를 stdin 스크립트에 담습니다(argv에 세션 값을 두지 않음).
/* global console, fetch, AbortSignal, URL, setTimeout, clearTimeout */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { assertLocalE2ETargets } from '../../../../scripts/lib/e2e-local.mjs';
import { readInstanceEnv } from '../../../../scripts/lib/instance.mjs';
import { SESSION_COOKIE } from './browser.mjs';

const KEYS = ['WEB_URL', 'API_URL', 'SHORT_LINK_BASE_URL', 'DATABASE_URL'];

/** scripts/e2e.mjs와 같이 환경변수 → .local/instance.env 순서로 읽고 네 대상이 모두 루프백인지 먼저 검사합니다. */
export function loadTargets(root) {
  const instance = readInstanceEnv(root) ?? {};
  const env = Object.fromEntries(KEYS.map((key) => [key, process.env[key] || instance[key]]));
  const missing = KEYS.filter((key) => !env[key]);
  if (missing.length > 0)
    throw new Error(`E2E 대상 설정(${missing.join(', ')})이 없습니다. make up을 먼저 실행하세요.`);
  assertLocalE2ETargets(env);
  return env;
}

export async function assertStackReachable(env) {
  const unreachable = [];
  for (const [name, url] of [
    ['api', new URL('/api/health/ready', env.API_URL).href],
    ['web', env.WEB_URL],
  ]) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      unreachable.push(`${name}: ${url} 응답 없음 (${error.cause?.code ?? error.message})`);
    }
  }
  const db = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    await db.connect();
    await db.query('SELECT 1 FROM short_slugs LIMIT 1');
  } catch (error) {
    unreachable.push(`db: ${error.message}`);
  } finally {
    await db.end().catch(() => {});
  }
  if (unreachable.length > 0)
    throw new Error(`실행 중인 서비스에 연결할 수 없습니다(make up).\n${unreachable.join('\n')}`);
}

function egoBinary() {
  if (spawnSync('ego-browser', ['--version'], { stdio: 'ignore' }).status === 0) return 'ego-browser';
  const fallback = join(homedir(), '.local/bin/ego-browser');
  if (existsSync(fallback)) return fallback;
  throw new Error('ego-browser를 찾을 수 없습니다. ego lite 설치와 PATH를 확인하세요.');
}

/**
 * 브라우저 모듈의 run()을 ego-browser 런타임에서 실행합니다. 스크립트가 끝까지 돌아 결과 파일을 남겼고 실패가 0일 때만 0을 돌려줍니다.
 * 종료 코드 0만 믿으면 런타임이 조기 종료한 경우를 통과로 볼 수 있어 결과 파일까지 확인합니다.
 * signal이 abort되면 ego 프로세스 그룹을 끝내고, 스크립트가 못 한 세션 쿠키·TaskSpace 정리를 대신 수행합니다.
 */
export async function runInBrowser({ moduleUrl, config, resultPath, signal }) {
  if (signal.aborted) return 1;
  rmSync(resultPath, { force: true });
  const script = `const config = ${JSON.stringify({ ...config, resultPath })};
const { run } = await import(${JSON.stringify(moduleUrl)});
process.exitCode = await run({ taskSpace, config });
`;
  const binary = egoBinary();
  // 런타임이 프로세스를 더 띄워도 함께 끝나도록 별도 프로세스 그룹으로 실행합니다. 터미널 신호는 이 그룹에 직접 닿지 않아 stop이 전달합니다.
  const child = spawn(binary, ['nodejs'], { stdio: ['pipe', 'inherit', 'inherit'], detached: true });
  let forceKill;
  const killGroup = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      // 이미 끝난 프로세스 그룹입니다.
    }
  };
  const stop = () => {
    killGroup('SIGTERM');
    forceKill = setTimeout(() => killGroup('SIGKILL'), 5_000);
  };
  signal.addEventListener('abort', stop, { once: true });
  child.stdin.end(script);
  const exit = await new Promise((done, failed) => {
    child.on('error', failed);
    child.on('close', (code, closeSignal) => done({ code, signal: closeSignal }));
  });
  clearTimeout(forceKill);
  signal.removeEventListener('abort', stop);
  if (!existsSync(resultPath)) {
    console.error(
      `[ego] 결과 파일이 없습니다(ego-browser 종료 코드 ${exit.code ?? exit.signal}). 시험이 끝까지 돌지 않았습니다.`,
    );
    releaseInterruptedBrowser(binary, config);
    return 1;
  }
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  return exit.code === 0 && result.failed === 0 ? 0 : 1;
}

/** 중단된 실행이 남긴 cl_session과 TaskSpace를 짧은 별도 라운드로 정리합니다. 다른 쿠키는 건드리지 않습니다. */
function releaseInterruptedBrowser(binary, config) {
  const cookie = { name: SESSION_COOKIE, domain: new URL(config.webUrl).hostname, path: '/' };
  const script = `const task = await taskSpace(${JSON.stringify(config.taskSpaceName)});
await task.page("p1").cdp("Network.deleteCookies", ${JSON.stringify(cookie)});
await task.finish({ keep: [] });
`;
  const run = spawnSync(binary, ['nodejs'], { input: script, stdio: ['pipe', 'inherit', 'inherit'], timeout: 20_000 });
  if (run.status === 0) console.error('[ego] 중단된 실행의 세션 쿠키와 TaskSpace를 정리했습니다.');
  else console.error(`[ego] 중단된 실행의 브라우저 정리 실패(종료 코드 ${run.status ?? run.signal}).`);
}

export const moduleUrlOf = (path) => pathToFileURL(path).href;
