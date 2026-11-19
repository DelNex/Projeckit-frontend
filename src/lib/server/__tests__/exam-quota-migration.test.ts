import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('exam queue migration serializes quota checks before inserting jobs', async () => {
  const queueMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119150000_atomic_exam_generation_quotas.sql', import.meta.url),
    'utf8',
  );
  const accessMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119133200_restrict_school_configuration_writes_to_admins.sql', import.meta.url),
    'utf8',
  );
  const indexMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119140500_index_application_foreign_keys.sql', import.meta.url),
    'utf8',
  );
  const gradingMigration = await readFile(
    new URL('../../../../supabase/migrations/20261119144000_guard_grading_period_admin_writes.sql', import.meta.url),
    'utf8',
  );

  assert.match(queueMigration, /pg_advisory_xact_lock\(\s*hashtextextended\('projectkit:exam-generation-quota:'/);
  assert.match(queueMigration, /EXAM_HOURLY_LIMIT_REACHED/);
  assert.match(queueMigration, /EXAM_DAILY_LIMIT_REACHED/);
  assert.match(queueMigration, /FOR UPDATE/);
  assert.match(queueMigration, /REVOKE ALL ON FUNCTION public\.enqueue_groq_exam_generation_job/);
  assert.match(queueMigration, /GRANT EXECUTE ON FUNCTION public\.enqueue_groq_exam_generation_job/);
  assert.match(queueMigration, /archived_at IS NULL/);
  assert.match(queueMigration, /p_hourly_limit integer/);
  assert.match(queueMigration, /p_daily_limit integer/);
  assert.match(queueMigration, /enqueue_groq_exam_generation_job\(uuid, uuid, uuid, jsonb, text, integer, integer\)/);

  assert.match(accessMigration, /Tenant members can view profiles/);
  assert.match(accessMigration, /Tenant admins can insert audit logs/);
  assert.doesNotMatch(accessMigration, /Tenant members can insert own audit events/);
  assert.match(accessMigration, /archived_at IS NULL/);

  assert.match(indexMigration, /idx_exam_generation_jobs_created_by_fk/);
  assert.match(indexMigration, /idx_exam_generation_jobs_tenant_id_fk/);

  assert.match(gradingMigration, /Tenant admins can insert grading periods/);
  assert.match(gradingMigration, /guard_grading_period_writes/);
  assert.match(gradingMigration, /Only an approved school administrator can change grading periods/);
});
