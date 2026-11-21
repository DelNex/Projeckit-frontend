import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = new URL('../../../../supabase/migrations/20261121052000_count_root_exam_jobs_for_quotas.sql', import.meta.url);

test('atomic quota migration serializes admission and validates tenant ownership', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /profile_tenant IS DISTINCT FROM p_tenant_id/);
  assert.match(sql, /EXAM_HOURLY_LIMIT_REACHED/);
  assert.match(sql, /EXAM_DAILY_LIMIT_REACHED/);
  assert.equal((sql.match(/j\.parent_job_id IS NULL/g) || []).length, 2, 'hourly and daily quotas must count only root exam requests');
  assert.match(sql, /p_hourly_limit integer DEFAULT 5/);
  assert.match(sql, /p_daily_limit integer DEFAULT 100/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enqueue_groq_exam_generation_job/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.enqueue_groq_exam_generation_job[\s\S]*TO service_role/);
});
