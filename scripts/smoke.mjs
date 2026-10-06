#!/usr/bin/env node
// 실행 중인 API·웹에 Playwright smoke 테스트(tests/smoke/)를 실행합니다.
// 주소는 API_URL·WEB_URL 환경변수, 없으면 .local/instance.env 값을 씁니다. 나머지 인자는 playwright test에 넘깁니다.
// 기준 문서: docs/development/verification.md
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { readInstanceEnv } from './lib/instance.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const instance = readInstanceEnv(root);
const apiUrl = process.env.API_URL || instance?.API_URL;
const webUrl = process.env.WEB_URL || instance?.WEB_URL;
if (!apiUrl || !webUrl) {
  fail(
    'smoke 대상 주소(API_URL·WEB_URL)가 없습니다.\n' +
      '- 이 작업공간의 서비스를 띄우세요: make up (주소는 인스턴스 설정 .local/instance.env를 씁니다. 설정 확인: pnpm instance)\n' +
      '- 다른 주소를 검사하려면: API_URL=http://127.0.0.1:<API 포트> WEB_URL=http://127.0.0.1:<웹 포트> pnpm smoke (포트: pnpm instance)',
  );
}

// 테스트 전에 두 서비스가 연결을 받는지 확인합니다. 응답 내용은 테스트가 검사합니다.
const unreachable = [];
for (const [name, url] of [
  ['api', new URL('/api/health', apiUrl).href],
  ['web', webUrl],
]) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    unreachable.push(`- ${name}: ${url} 응답 없음 (${error.cause?.code ?? error.message})`);
  }
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
      '- 브라우저를 설치하세요: pnpm exec playwright install chromium\n' +
      '- Linux에서 시스템 라이브러리도 필요하면: pnpm exec playwright install --with-deps chromium',
  );
}

console.log(`smoke 대상: API ${apiUrl}, 웹 ${webUrl}`);
const run = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'tests/smoke/playwright.config.ts', ...process.argv.slice(2)],
  { cwd: root, env: { ...process.env, API_URL: apiUrl, WEB_URL: webUrl }, stdio: 'inherit' },
);
if (run.error) fail(`playwright 실행 실패: ${run.error.message}. pnpm install로 의존성을 설치하세요.`);
process.exit(run.status ?? 1);
