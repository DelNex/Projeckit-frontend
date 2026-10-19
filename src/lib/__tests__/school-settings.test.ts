import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPublicRegistrationAllowed,
  saveSchoolSettings,
  validateSchoolSettings,
} from '../server/school-settings';

const values = {
  default_passing_mps: 75,
  allow_public_registration: false,
  max_module_upload_mb: 40,
  max_scan_image_mb: 20,
};

test('school settings validation checks ranges, integers, and platform caps', () => {
  assert.equal(validateSchoolSettings(values, { module: 60, scan: 30 }).values?.default_passing_mps, 75);
  assert.match(validateSchoolSettings({ ...values, max_module_upload_mb: 61 }, { module: 60, scan: 30 }).error || '', /1 to 60 MB/);
  assert.match(validateSchoolSettings({ ...values, max_scan_image_mb: 2.5 }, { module: 60, scan: 30 }).error || '', /whole number/);
  assert.match(validateSchoolSettings({ ...values, default_passing_mps: 39 }, { module: 60, scan: 30 }).error || '', /between 40 and 100/);
});

test('a non-admin settings PUT returns 403 without making a database write', async () => {
  let calls = 0;
  const admin = { from() { calls += 1; throw new Error('unexpected DB access'); } };
  const result = await saveSchoolSettings(admin, {
    id: 'teacher-a', tenant_id: 'tenant-a', role: 'teacher', status: 'approved',
  }, values);
  assert.equal(result.status, 403);
  assert.match(String(result.body.error), /administrator/);
  assert.equal(calls, 0);
});

test('tenant A cannot write tenant B settings, even if the payload includes tenant_id B', async () => {
  const writes: Array<{ table: string; tenantFilter?: string; payload?: unknown }> = [];
  const admin = {
    from(table: string) {
      const entry: { table: string; tenantFilter?: string; payload?: unknown } = { table };
      writes.push(entry);
      const builder: any = {
        select() { return builder; },
        eq(column: string, value: string) { if (column === 'tenant_id') entry.tenantFilter = value; return builder; },
        maybeSingle: async () => ({ data: { tenant_id: 'tenant-a', default_passing_mps: 60 }, error: null }),
        upsert(payload: unknown) { entry.payload = payload; return builder; },
        single: async () => ({ data: { ...values, tenant_id: 'tenant-a' }, error: null }),
        insert: async () => ({ error: null }),
      };
      return builder;
    },
  };
  const result = await saveSchoolSettings(admin, {
    id: 'admin-a', tenant_id: 'tenant-a', role: 'admin', status: 'approved',
  }, { ...values, tenant_id: 'tenant-b' } as typeof values);
  assert.equal(result.status, 200);
  const saved = writes.find((write) => write.table === 'school_settings' && write.payload);
  assert.equal((saved?.payload as any).tenant_id, 'tenant-a');
  assert.ok(writes.every((write) => write.table !== 'school_settings' || !write.tenantFilter || write.tenantFilter === 'tenant-a'));
});

test('registration is refused only when the resolved school setting is false', () => {
  assert.equal(isPublicRegistrationAllowed(false), false);
  assert.equal(isPublicRegistrationAllowed(true), true);
  assert.equal(isPublicRegistrationAllowed(undefined), true);
});
