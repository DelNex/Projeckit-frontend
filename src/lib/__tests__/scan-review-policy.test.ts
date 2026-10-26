import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { shouldRequireVerification } from '../scan-review-policy';

test('teacher review of every answer and an assigned learner resolves a detected conflict', () => {
  assert.equal(shouldRequireVerification({
    reviewedItems: { '1': { teacherConfirmed: true }, '2': { teacherConfirmed: true } },
    assignedStudentId: 'student-1',
    hasIdentityConflict: true,
    scanStatus: 'PROCESSED',
    overallConfidence: 1,
  }), false);
});

test('unreviewed identity conflicts, failed scans, and low-confidence scans remain gated', () => {
  assert.equal(shouldRequireVerification({ hasIdentityConflict: true, scanStatus: 'PROCESSED', overallConfidence: 1 }), true);
  assert.equal(shouldRequireVerification({ hasIdentityConflict: false, scanStatus: 'FAILED', overallConfidence: 1 }), true);
  assert.equal(shouldRequireVerification({ hasIdentityConflict: false, scanStatus: 'PROCESSED', overallConfidence: 0.5 }), true);
});
