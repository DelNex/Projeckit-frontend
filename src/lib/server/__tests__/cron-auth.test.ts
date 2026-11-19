import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthorizedCronRequest } from '../cron-auth';

const secret = 'test-cron-secret-that-is-at-least-32-characters-long';

test('accepts a valid bearer cron secret', () => {
  const request = new Request('https://example.test/api/internal/ai/dispatch', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(isAuthorizedCronRequest(request, secret), true);
});

test('accepts the dedicated cron header', () => {
  const request = new Request('https://example.test/api/internal/ai/dispatch', {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
  assert.equal(isAuthorizedCronRequest(request, secret), true);
});

test('rejects missing, short, and incorrect secrets', () => {
  const makeRequest = (value?: string) => new Request('https://example.test', {
    method: 'POST',
    headers: value ? { authorization: `Bearer ${value}` } : {},
  });
  assert.equal(isAuthorizedCronRequest(makeRequest(), secret), false);
  assert.equal(isAuthorizedCronRequest(makeRequest('short'), secret), false);
  assert.equal(isAuthorizedCronRequest(makeRequest('x'.repeat(secret.length)), secret), false);
  assert.equal(isAuthorizedCronRequest(makeRequest(secret), ''), false);
  assert.equal(isAuthorizedCronRequest(makeRequest(secret), 'too-short'), false);
});
