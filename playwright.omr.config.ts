import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'omr-*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start -p 3100',
    url: 'http://127.0.0.1:3100/omr-validation',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});