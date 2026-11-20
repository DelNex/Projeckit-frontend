import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'omr-responsive-ui.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3200', browserName: 'chromium' },
  webServer: {
    command: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-placeholder node node_modules/next/dist/bin/next start -p 3200',
    url: 'http://127.0.0.1:3200/login',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});