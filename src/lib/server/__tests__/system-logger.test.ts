import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logSystemEvent } from '../system-logger';

test('system diagnostics include request context and redact secrets', async () => {
  const original = console.error;
  let output = '';
  console.error = (...values: unknown[]) => { output = values.map(String).join(' '); };
  try {
    await logSystemEvent({
      severity: 'error', source: 'exam.generate', code: 'EXAM_QUEUE_FAILED',
      message: 'request failed api_key=do-not-print-this',
      method: 'POST', route: '/api/ai/exam-jobs?token=private', requestId: 'request-test-1',
      metadata: { provider: 'groq', authorization: 'Bearer private-token', count: 3 },
    });
  } finally { console.error = original; }
  assert.match(output, /EXAM_QUEUE_FAILED/);
  assert.match(output, /request-test-1/);
  assert.match(output, /REDACTED/);
  assert.doesNotMatch(output, /do-not-print-this|private-token|token=private/);
});

test('diagnostics do not throw for unsupported metadata', async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.doesNotReject(() => logSystemEvent({
    severity: 'error', source: 'test.circular', message: 'safe failure', metadata: circular,
  }));
});
