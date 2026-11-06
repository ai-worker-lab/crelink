import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  projects: ['chromium', 'webkit', 'firefox'].map((browserName) => ({
    name: browserName,
    testMatch: /link-layout\.spec\.ts$/,
    use: { browserName: browserName as 'chromium' | 'webkit' | 'firefox' },
  })),
});
