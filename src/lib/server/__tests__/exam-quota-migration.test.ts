import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('exam queue migration serializes quota checks before inserting jobs', async () => {
  const securityMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119133200_restrict_school_configuration_writes_to_admins.sql', import.meta.url),
    'utf8',
  );
  const indexMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119140500_index_application_foreign_keys.sql', import.meta.url),
    'utf8',
  );
  const quotaMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119150000_atomic_exam_generation_quotas.sql', import.meta.url),
    'utf8',
  );

  assert.match(quotaMigration, /pg_advisory_xact_lock/);
  assert.match(quotaMigration, /EXAM_HOURLY_LIMIT_REACHED/);
  assert.match(quotaMigration, /EXAM_DAILY_LIMIT_REACHED/);
  assert.match(quotaMigration, /FOR UPDATE/);
  assert.match(quotaMigration, /pg_column_size\(p_payload\) > 1572864/);
  assert.match(quotaMigration, /p_hourly_limit integer DEFAULT 5/);
  assert.match(quotaMigration, /p_daily_limit integer DEFAULT 100/);
  assert.match(quotaMigration, /enqueue_groq_exam_generation_job\(uuid, uuid, uuid, jsonb, text, integer, integer\)/);
  assert.match(quotaMigration, /REVOKE ALL ON FUNCTION public\.enqueue_groq_exam_generation_job/);
  assert.match(quotaMigration, /GRANT EXECUTE ON FUNCTION public\.enqueue_groq_exam_generation_job/);

  assert.match(indexMigration, /idx_exam_generation_jobs_created_by_fk/);
  assert.match(indexMigration, /idx_exam_generation_jobs_tenant_id_fk/);
  assert.match(securityMigration, /archived_at IS NULL/);
  assert.match(securityMigration, /Tenant members can view profiles/);
  assert.match(securityMigration, /Approved tenant members can view grading periods/);
  assert.match(securityMigration, /Tenant members can insert own audit events/);
  assert.doesNotMatch(securityMigration, /CREATE POLICY \\\"Tenant admins can insert audit logs\\\"/);
});
