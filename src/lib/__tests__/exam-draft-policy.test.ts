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

test('atomic draft save checks versions and scan results without touching answer keys', async () => {
  const sql = await readFile(new URL('../../../../supabase/migrations/20260908000033_save_exam_draft.sql', import.meta.url), 'utf8');
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /v_tos\.updated_at <> p_expected_updated_at/);
  assert.match(sql, /public\.responses/);
  assert.match(sql, /public\.scan_results/);
  assert.doesNotMatch(sql, /public\.answer_keys/);
});
