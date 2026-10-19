import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearUploadLimitsCache,
  formatUploadLimitError,
  getUploadLimits,
  isUploadWithinLimit,
  normalizeUploadLimits,
} from '../upload-limits';

test('upload limits use defaults and never exceed platform caps', () => {
  assert.deepEqual(normalizeUploadLimits(null, null), { maxModuleUploadMb: 60, maxScanImageMb: 15 });
  assert.deepEqual(normalizeUploadLimits(
    { max_module_upload_mb: 72, max_scan_image_mb: 50 },
    { max_module_upload_cap_mb: 60, max_scan_image_cap_mb: 30 },
  ), { maxModuleUploadMb: 60, maxScanImageMb: 30 });
});

test('upload limits are cached for 60 seconds by tenant', async () => {
  clearUploadLimitsCache();
  let reads = 0;
  const admin = { from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => {
      reads += 1;
      return { data: table === 'school_settings' ? { max_module_upload_mb: 20, max_scan_image_mb: 10 } : { max_module_upload_cap_mb: 60, max_scan_image_cap_mb: 30 }, error: null };
    } }) }),
  }) };
  assert.equal((await getUploadLimits(admin, 'school-a', 100)).maxModuleUploadMb, 20);
  await getUploadLimits(admin, 'school-a', 1000);
  assert.equal(reads, 2);
  await getUploadLimits(admin, 'school-a', 61_000);
  assert.equal(reads, 4);
  clearUploadLimitsCache();
});

test('server size check rejects stored files above the school limit with a specific error', () => {
  const storedSize = 30 * 1024 * 1024;
  assert.equal(isUploadWithinLimit(storedSize, 20), false);
  assert.equal(formatUploadLimitError(storedSize, 20), 'This file is 30 MB. The limit for your school is 20 MB.');
  assert.equal(isUploadWithinLimit(20 * 1024 * 1024, 20), true);
});
