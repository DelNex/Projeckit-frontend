import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationPath = new URL('../../../../supabase/migrations/20261119233450_restrict_school_configuration_writes_to_admins.sql', import.meta.url);

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


const gradingPeriodGuardMigration = new URL('../../../../supabase/migrations/20261119235748_guard_grading_period_rpc_tenant_context.sql', import.meta.url);

test('grading period SECURITY DEFINER RPCs reject callers without an approved tenant', async () => {
  const sql = await readFile(gradingPeriodGuardMigration, 'utf8');
  for (const functionName of ['get_grading_period_usage', 'restore_grading_period', 'set_current_grading_period']) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
    assert.notEqual(start, -1, `Missing replacement for ${functionName}`);
    const end = sql.indexOf('$function$;', start);
    assert.notEqual(end, -1, `Could not find end of ${functionName}`);
    const definition = sql.slice(start, end);
    const guard = definition.indexOf('IF caller_tenant IS NULL AND NOT public.is_platform_admin() THEN');
    const targetLookup = definition.indexOf('SELECT * INTO target_period');
    assert.ok(guard >= 0, `${functionName} must reject callers without approved tenant context`);
    assert.ok(targetLookup < 0 || guard < targetLookup, `${functionName} must check tenant context before reading the target period`);
  }
});
