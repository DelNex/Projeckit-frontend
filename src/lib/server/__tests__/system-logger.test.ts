import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logSystemEvent } from '../system-logger';

test('system diagnostics emit structured logs and redact secrets', async () => {
  const original = console.error;
  let output = '';
  console.error = (...values: unknown[]) => { output = values.map(String).join(' '); };
  try {
    await logSystemEvent({
      severity: 'error',
      source: 'test.route',
      code: 'TEST_FAILURE',
      message: 'request failed api_key=super-secret-value',
      method: 'POST',
      route: '/api/test?token=private',
      requestId: 'req-test-123',
      metadata: { provider: 'gemini', authorization: 'Bearer private-token', count: 3 },
    });
  } finally {
    console.error = original;
  }
  assert.match(output, /TEST_FAILURE/);
  assert.match(output, /req-test-123/);
  assert.match(output, /REDACTED/);
  assert.doesNotMatch(output, /super-secret-value|private-token|token=private/);
});

test('diagnostics never throw for circular metadata', async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.doesNotReject(() => logSystemEvent({
    severity: 'error', source: 'test.circular', message: 'safe failure', metadata: circular,
  }));
});
