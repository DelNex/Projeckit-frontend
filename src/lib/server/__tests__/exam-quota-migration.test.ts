import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('exam queue migration serializes quota checks before inserting jobs', async () => {
  const migration = await readFile(
    new URL('../../../../supabase/migrations/20261119133200_restrict_school_configuration_writes_to_admins.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('exam-job-user:'/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('exam-job-tenant:'/);
  assert.match(migration, /EXAM_HOURLY_LIMIT_REACHED/);
  assert.match(migration, /EXAM_DAILY_LIMIT_REACHED/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.enqueue_groq_exam_generation_job/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.enqueue_groq_exam_generation_job/);
  assert.match(migration, /archived_at IS NULL/);
  assert.match(migration, /Tenant members can view profiles/);
  assert.match(migration, /idx_exam_generation_jobs_created_by/);
  assert.match(migration, /idx_exam_generation_jobs_tenant_id/);
  assert.match(migration, /Approved tenant members can view grading periods/);
  assert.match(migration, /Tenant members can insert own audit events/);
  assert.doesNotMatch(migration, /Tenant admins can insert audit logs/);
  assert.match(migration, /p_hourly_limit integer/);
  assert.match(migration, /p_daily_limit integer/);
  assert.match(migration, /enqueue_groq_exam_generation_job\(uuid, uuid, uuid, jsonb, text, integer, integer\)/);
});
