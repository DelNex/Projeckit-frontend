import assert from 'node:assert/strict';
import test from 'node:test';
import { InvalidServiceKeyError, validateSupabaseServiceKey } from '../admin';

test('rejects Groq credentials in the Supabase service-role variable', () => {
  assert.throws(() => validateSupabaseServiceKey('gsk_test_groq_key'), (error: unknown) =>
    error instanceof InvalidServiceKeyError && /Groq API key/.test(error.message));
});

test('rejects Supabase publishable keys as service-role credentials', () => {
  assert.throws(() => validateSupabaseServiceKey('sb_publishable_test'), InvalidServiceKeyError);
});

test('rejects legacy Supabase JWT keys without the service_role claim', () => {
  const payload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  assert.throws(() => validateSupabaseServiceKey(`eyJhbGciOiJIUzI1NiJ9.${payload}.signature`), InvalidServiceKeyError);
});

test('accepts a Supabase secret key format and a service_role JWT', () => {
  assert.equal(validateSupabaseServiceKey('sb_secret_test'), 'sb_secret_test');
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const key = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
  assert.equal(validateSupabaseServiceKey(key), key);
});
