import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBackendBaseUrl } from '../backend-url';

test('uses the configured HTTPS backend in production', () => {
  assert.equal(
    resolveBackendBaseUrl({ NODE_ENV: 'production', BACKEND_API_BASE_URL: 'https://projectkit-backend.onrender.com/' }),
    'https://projectkit-backend.onrender.com',
  );
});

test('never falls back to localhost in production', () => {
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'production', BACKEND_API_BASE_URL: undefined }), null);
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'production', BACKEND_API_BASE_URL: ' ' }), null);
});

test('allows localhost only in development', () => {
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'development', BACKEND_API_BASE_URL: undefined }), 'http://localhost:4000');
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'development', BACKEND_API_BASE_URL: 'http://localhost:5000/' }), 'http://localhost:5000');
});

test('rejects insecure or malformed production backend URLs', () => {
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'production', BACKEND_API_BASE_URL: 'http://example.com' }), null);
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'production', BACKEND_API_BASE_URL: 'not-a-url' }), null);
  assert.equal(resolveBackendBaseUrl({ NODE_ENV: 'production', BACKEND_API_BASE_URL: 'https://user:pass@example.com' }), null);
});

test('uses the configured HTTPS public app URL in production', async () => {
  const { resolvePublicAppUrl } = await import('../backend-url');
  assert.equal(
    resolvePublicAppUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://projectket.netlify.app/path' }),
    'https://projectket.netlify.app',
  );
});

test('never generates production password reset links to localhost', async () => {
  const { resolvePublicAppUrl } = await import('../backend-url');
  assert.equal(resolvePublicAppUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: undefined }), null);
  assert.equal(resolvePublicAppUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }), null);
});
