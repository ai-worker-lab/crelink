// 영향 범위를 분석 UI로 한정한 다중 엔진 실행. 일반 E2E의 전역 데이터 시나리오는 반복하지 않습니다.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  reporter: [['list'], ['json', { outputFile: '../../.local/e2e/analytics-responsive-report.json' }]],
  projects: ['chromium', 'webkit', 'firefox'].map((browserName) => ({
    name: browserName,
    testMatch: /analytics-responsive\.spec\.ts$/,
    use: { browserName: browserName as 'chromium' | 'webkit' | 'firefox' },
  })),
});
