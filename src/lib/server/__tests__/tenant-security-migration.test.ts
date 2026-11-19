import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = new URL('../../../../supabase/migrations/20261119133200_restrict_school_configuration_writes_to_admins.sql', import.meta.url);

test('tenant security migration scopes profile reads and school configuration writes', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /tenant_id = \(SELECT public\.get_current_tenant_id\(\)\)/);
  assert.match(sql, /Tenant admins can insert academic configs/);
  assert.match(sql, /Tenant admins can update sections/);
  assert.match(sql, /Tenant admins can update subjects/);
  assert.match(sql, /Tenant admins can update grading periods/);
  assert.match(sql, /Tenant admins can read audit logs/);
  assert.match(sql, /archived_at IS NULL/);
  assert.match(sql, /CREATE TRIGGER trg_guard_grading_period_writes/);
});
