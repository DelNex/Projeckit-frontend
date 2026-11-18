import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'omr-browser.spec.ts',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    launchOptions: { channel: 'chrome' },
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev -p 3100',
    url: 'http://127.0.0.1:3100/omr-validation',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
