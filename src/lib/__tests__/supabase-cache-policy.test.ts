import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldCacheSupabaseRead } from '../supabase/client';

test('live school and exam tables bypass the browser read cache', () => {
  for (const table of ['tos_documents', 'assessments', 'answer_keys', 'exam_generation_jobs', 'school_settings', 'profiles']) {
    assert.equal(shouldCacheSupabaseRead(table), false, `${table} must always be fresh`);
  }
});

test('question and answer columns bypass cache even on other tables', () => {
  assert.equal(shouldCacheSupabaseRead('some_table', ['id, questions']), false);
  assert.equal(shouldCacheSupabaseRead('some_table', ['answers']), false);
  assert.equal(shouldCacheSupabaseRead('some_table', ['id, title']), true);
  assert.equal(shouldCacheSupabaseRead('some_table', ['*']), false);
});
