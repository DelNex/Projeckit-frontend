import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teacherExamErrorMessage } from '../exam-jobs';

test('provider schema errors are translated into teacher-friendly guidance', () => {
  const message = teacherExamErrorMessage('Groq returned HTTP 400: invalid JSON schema');
  assert.match(message, /couldn't prepare the questions correctly/i);
  assert.doesNotMatch(message, /Groq|JSON schema|HTTP 400/i);
});

test('document extraction errors explain what the teacher should check', () => {
  const message = teacherExamErrorMessage('OCR found no readable text in the uploaded PDF');
  assert.match(message, /lesson materials/i);
  assert.match(message, /clear/i);
});

test('unknown internal errors never leak to teachers', () => {
  const message = teacherExamErrorMessage('ECONNRESET at internal-worker.ts:42');
  assert.doesNotMatch(message, /ECONNRESET|internal-worker|42/);
  assert.match(message, /school administrator/i);
});
