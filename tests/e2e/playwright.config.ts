// 크리링 MVP E2E 설정. pnpm e2e(scripts/e2e.mjs)가 WEB_URL·API_URL·SHORT_LINK_BASE_URL·DATABASE_URL을 넣어 실행합니다.
// 기준 문서: tests/e2e/README.md, docs/specs/crelink-mvp.md#검증-계획
import { defineConfig, devices } from '@playwright/test';

const missing = ['WEB_URL', 'API_URL', 'SHORT_LINK_BASE_URL', 'DATABASE_URL'].filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`${missing.join(', ')}이 없습니다. pnpm e2e로 실행하세요(tests/e2e/README.md).`);
}

export default defineConfig({
  testDir: '.',
  outputDir: '../../.local/e2e/test-results',
  forbidOnly: !!process.env.CI,
  // 개발 서버(next dev)가 화면을 처음 컴파일할 때 느리므로 여유를 둡니다.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    baseURL: process.env.WEB_URL,
    trace: 'retain-on-failure',
  },
});
