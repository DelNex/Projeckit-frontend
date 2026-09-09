import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getValidatedFrontendEnv } from '../env';

describe('Project KIT — Frontend Environment Validation Layer', () => {
  const originalEnv = { ...process.env };

  it('throws explicit error when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';

    assert.throws(
      () => getValidatedFrontendEnv(),
      /Missing NEXT_PUBLIC_SUPABASE_URL/
    );

    process.env = { ...originalEnv };
  });

  it('throws explicit error when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    assert.throws(
      () => getValidatedFrontendEnv(),
      /Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
    );

    process.env = { ...originalEnv };
  });

  it('successfully returns validated configuration when present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ptrpguoyqdkkhnhaepiq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test123';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    const env = getValidatedFrontendEnv();
    assert.strictEqual(env.NEXT_PUBLIC_SUPABASE_URL, 'https://ptrpguoyqdkkhnhaepiq.supabase.co');
    assert.strictEqual(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_test123');
    assert.strictEqual(env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000');

    process.env = { ...originalEnv };
  });
});
