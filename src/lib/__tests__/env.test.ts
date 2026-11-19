import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getValidatedFrontendEnv } from '../env';

describe('Project KIT — Frontend Environment Validation Layer', () => {
  const originalEnv = { ...process.env };

  function restoreEnvironment() {
    process.env = { ...originalEnv };
  }

  it('throws explicit error when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://projectket.netlify.app';
    assert.throws(() => getValidatedFrontendEnv(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
    restoreEnvironment();
  });

  it('throws explicit error when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_APP_URL = 'https://projectket.netlify.app';
    assert.throws(() => getValidatedFrontendEnv(), /Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    restoreEnvironment();
  });

  it('requires NEXT_PUBLIC_APP_URL instead of silently falling back to localhost', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ptrpguoyqdkkhnhaepiq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test123';
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.throws(() => getValidatedFrontendEnv(), /Missing NEXT_PUBLIC_APP_URL/);
    restoreEnvironment();
  });

  it('rejects localhost and non-HTTPS public URLs in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ptrpguoyqdkkhnhaepiq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test123';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    assert.throws(() => getValidatedFrontendEnv(), /valid HTTPS origin/);
    restoreEnvironment();
  });

  it('returns the configured HTTPS origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ptrpguoyqdkkhnhaepiq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test123';
    process.env.NEXT_PUBLIC_APP_URL = 'https://projectket.netlify.app/dashboard';
    const env = getValidatedFrontendEnv();
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://ptrpguoyqdkkhnhaepiq.supabase.co');
    assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_test123');
    assert.equal(env.NEXT_PUBLIC_APP_URL, 'https://projectket.netlify.app');
    restoreEnvironment();
  });

  it('allows localhost HTTP only in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ptrpguoyqdkkhnhaepiq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test123';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    assert.equal(getValidatedFrontendEnv().NEXT_PUBLIC_APP_URL, 'http://localhost:3000');
    restoreEnvironment();
  });
});
