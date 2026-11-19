import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { EXAM_DRAFT_DEBOUNCE_MS, examDraftRetryDelay, isExamDraftConflict, shouldWarnBeforeClosing } from '../exam-draft-policy';

test('exam draft autosave waits for the requested debounce and backs off after failures', () => {
  assert.equal(EXAM_DRAFT_DEBOUNCE_MS, 1500);
  assert.equal(examDraftRetryDelay(0), 1500);
  assert.equal(examDraftRetryDelay(1), 3000);
  assert.equal(examDraftRetryDelay(8), 8000);
});

test('exam draft conflict is offered only for a newer-version 409 response', () => {
  assert.equal(isExamDraftConflict(409, 'A newer version was saved on another device'), true);
  assert.equal(isExamDraftConflict(409, 'This exam has scan results'), false);
  assert.equal(isExamDraftConflict(503, 'A newer version was saved on another device'), false);
});

test('dirty drafts warn before closing and saved drafts do not', () => {
  assert.equal(shouldWarnBeforeClosing(true), true);
  assert.equal(shouldWarnBeforeClosing(false), false);
});

test('autosave uses the atomic draft RPC and does not synchronize answer keys', async () => {
  const route = await readFile(new URL('../../../src/app/api/ai/save-exam/route.ts', import.meta.url), 'utf8');
  const autosave = route.slice(route.indexOf('if (body.autosave)'), route.indexOf('if (body.assessmentId)'));
  assert.match(autosave, /rpc\('save_exam_draft'/);
  assert.match(autosave, /p_expected_updated_at/);
  assert.doesNotMatch(autosave, /answer_keys/);
  assert.match(route, /status: conflict \? 409 : 400/);
});
