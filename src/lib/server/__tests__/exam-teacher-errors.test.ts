import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTeacherExamFailureMessage } from '../exam-teacher-errors';

test('teacher-facing provider failures are understandable and never expose raw provider details', () => {
  assert.match(getTeacherExamFailureMessage('groq returned HTTP 429: rate limit reached'), /AI services are busy/i);
  assert.match(getTeacherExamFailureMessage('provider returned HTTP 503: overloaded'), /temporarily unavailable/i);
  assert.match(getTeacherExamFailureMessage('openrouter HTTP 400: schema unsupported | gemini HTTP 503: overloaded'), /could not produce a valid exam response/i);
  assert.match(getTeacherExamFailureMessage('groq HTTP 400: Failed to generate JSON | openrouter: Provider returned an empty response body. | gemini HTTP 503: overloaded', { providerStatus: 503 }), /could not produce a valid exam response/i);
  assert.match(getTeacherExamFailureMessage('provider returned HTTP 401: invalid API key'), /school administrator/i);
  assert.doesNotMatch(getTeacherExamFailureMessage('provider returned HTTP 401: secret-key-value'), /secret-key-value/i);
});
