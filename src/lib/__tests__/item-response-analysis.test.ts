import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculateItemChoiceDistributions, deduplicateItemScans } from '../item-response-analysis';

const scan = (id: string, status: string, created_at: string, student_id: string | null, answers: Record<string, unknown>) => ({
  id, status, created_at, student_id, detected_roll_number: student_id ? null : 7, raw_answers: answers,
});

test('item-analysis counts only confirmed scans and uses the newest scan per learner', () => {
  const scans = [
    scan('new', 'PROCESSED', '2026-10-02T00:00:00Z', 'student-1', { '1': 'B' }),
    scan('old', 'PROCESSED', '2026-10-01T00:00:00Z', 'student-1', { '1': 'A' }),
    scan('review', 'VERIFICATION_REQUIRED', '2026-10-03T00:00:00Z', 'student-2', { '1': 'A' }),
    scan('pending', 'PENDING', '2026-10-04T00:00:00Z', 'student-3', { '1': 'A' }),
  ];

  assert.deepEqual(deduplicateItemScans(scans).map(({ id }) => id), ['new']);
  const result = calculateItemChoiceDistributions(scans, { '1': 'A' }, 1)[0];
  assert.equal(result.cases, 1);
  assert.equal(result.choices.find(({ choice }) => choice === 'A')?.count, 0);
  assert.equal(result.choices.find(({ choice }) => choice === 'B')?.count, 1);
});

test('review states stay separate from unanswered items in analysis', () => {
  const result = calculateItemChoiceDistributions([
    scan('review', 'PROCESSED', '2026-10-01T00:00:00Z', 'student-1', {
      '1': 'A',
      '2': 'B',
      _itemStates: { '1': 'ERASED_MARK', '2': 'MULTIPLE_MARK' },
    }),
  ], { '1': 'A', '2': 'B' }, 2);

  assert.equal(result[0].invalidMarks, 1);
  assert.equal(result[1].invalidMarks, 1);
  assert.equal(result[0].unanswered, 0);
  assert.equal(result[0].choices.find(({ choice }) => choice === 'A')?.count, 0);
  assert.equal(result[1].choices.find(({ choice }) => choice === 'B')?.count, 0);
});
