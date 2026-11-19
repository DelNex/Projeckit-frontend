import { defineConfig } from '@playwright/test';

const isCI = process.env.CI === 'true';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'omr-*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    launchOptions: { channel: 'chrome' },
  },
  webServer: {
    // CI validates the built production app, not a development server. Local
    // runs stay convenient and use next dev.
    command: isCI
      ? 'node node_modules/next/dist/bin/next start -p 3100'
      : 'node scripts/copy-ocr-assets.mjs && node node_modules/next/dist/bin/next dev -p 3100',
    url: 'http://127.0.0.1:3100/omr-validation',
    reuseExistingServer: !isCI,
    timeout: 120_000,
    ...(isCI ? {
      env: {
        OMR_VALIDATION_ENABLED: 'true',
        GITHUB_ACTIONS: 'true',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'ci-placeholder-publishable-key',
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
        SUPABASE_SERVICE_ROLE_KEY: 'ci-placeholder-service-role-key',
      },
    } : {}),
  },
});
