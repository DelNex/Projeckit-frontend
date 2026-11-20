import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTeacherExamFailureMessage } from '../exam-teacher-errors';

test('teacher-facing provider failures are understandable and never expose raw provider details', () => {
  assert.match(getTeacherExamFailureMessage('groq returned HTTP 429: rate limit reached'), /AI services are busy/i);
  assert.match(getTeacherExamFailureMessage('provider returned HTTP 503: overloaded'), /temporarily unavailable/i);
  assert.match(getTeacherExamFailureMessage('openrouter HTTP 400: schema unsupported | gemini HTTP 503: overloaded'), /temporarily unavailable/i);
  assert.match(getTeacherExamFailureMessage('provider returned HTTP 401: invalid API key'), /school administrator/i);
  assert.doesNotMatch(getTeacherExamFailureMessage('provider returned HTTP 401: secret-key-value'), /secret-key-value/i);
});
