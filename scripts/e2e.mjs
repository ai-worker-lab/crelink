#!/usr/bin/env node
// 실행 중인 API·웹·DB에 크리링 MVP E2E 시나리오(tests/e2e/)를 실행합니다.
// 주소는 WEB_URL·API_URL·SHORT_LINK_BASE_URL·DATABASE_URL 환경변수, 없으면 .local/instance.env 값을 씁니다.
// 나머지 인자는 playwright test에 넘깁니다. 기준 문서: tests/e2e/README.md
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import pg from 'pg';
import { readInstanceEnv } from './lib/instance.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const instance = readInstanceEnv(root) ?? {};
const KEYS = ['WEB_URL', 'API_URL', 'SHORT_LINK_BASE_URL', 'DATABASE_URL'];
const env = Object.fromEntries(KEYS.map((key) => [key, process.env[key] || instance[key]]));
const missing = KEYS.filter((key) => !env[key]);
if (missing.length > 0) {
  fail(
    `E2E 대상 설정(${missing.join(', ')})이 없습니다.\n` +
      '- 이 작업공간의 서비스를 띄우세요: make up (값은 인스턴스 설정 .local/instance.env를 씁니다. 설정 확인: pnpm instance)\n' +
      '- 다른 인스턴스를 검사하려면 네 값을 모두 환경변수로 넘기세요(tests/e2e/README.md).',
  );
}

// 테스트 전에 세 서비스가 연결을 받는지 확인합니다. 응답 내용은 테스트가 검사합니다.
const unreachable = [];
for (const [name, url] of [
  ['api', new URL('/api/health/ready', env.API_URL).href],
  ['web', env.WEB_URL],
]) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    unreachable.push(`- ${name}: ${url} 응답 없음 (${error.cause?.code ?? error.message})`);
  }
}
const db = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  await db.connect();
  await db.query('SELECT 1 FROM short_slugs LIMIT 1');
} catch (error) {
  unreachable.push(`- db: ${error.message} (API가 한 번 기동해 migration을 적용했는지 확인하세요)`);
} finally {
  await db.end().catch(() => {});
}
if (unreachable.length > 0) {
  fail(
    `실행 중인 서비스에 연결할 수 없습니다.\n${unreachable.join('\n')}\n` +
      '- 서비스를 띄우세요: make up (상태 확인: make status)\n' +
      '- 이미 띄웠다면 로그를 확인하세요: pnpm logs api / pnpm logs web',
  );
}

try {
  const browser = await chromium.launch();
  await browser.close();
} catch (error) {
  fail(
    `Playwright Chromium을 실행할 수 없습니다: ${error.message.split('\n')[0]}\n` +
      '- 브라우저를 설치하세요: pnpm exec playwright install chromium',
  );
}

console.log(`E2E 대상: 웹 ${env.WEB_URL}, API ${env.API_URL}, 단축 도메인 ${env.SHORT_LINK_BASE_URL}`);
const run = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'tests/e2e/playwright.config.ts', ...process.argv.slice(2)],
  { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' },
);
if (run.error) fail(`playwright 실행 실패: ${run.error.message}. pnpm install로 의존성을 설치하세요.`);
process.exit(run.status ?? 1);
