// 실행 중인 API·웹 smoke 테스트 설정. pnpm smoke(scripts/smoke.mjs)가 API_URL·WEB_URL을 넣어 실행합니다.
// 기준 문서: docs/development/verification.md
import { defineConfig, devices } from '@playwright/test';

if (!process.env.API_URL || !process.env.WEB_URL) {
  throw new Error('API_URL·WEB_URL이 없습니다. pnpm smoke로 실행하세요(docs/development/verification.md).');
}

export default defineConfig({
  testDir: '.',
  outputDir: '../../.local/smoke/test-results',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.WEB_URL,
    trace: 'retain-on-failure',
  },
});
