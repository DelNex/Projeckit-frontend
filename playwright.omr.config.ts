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
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev -p 3100',
    url: 'http://127.0.0.1:3100/omr-validation',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The root layout mounts TenantProvider even on the isolated OMR test route.
    // Supply inert public values so the client can initialize without real credentials.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'omr-browser-test-key',
    },
  },
});
