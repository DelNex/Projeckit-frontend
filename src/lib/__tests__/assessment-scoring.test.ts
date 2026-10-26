import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculateAssessmentScore, isAnswerCorrect, percentageToMps } from '../assessment-scoring';

test('scan and analytics scoring share case-insensitive matching and stable percentage rounding', () => {
  const score = calculateAssessmentScore({ 1: ' a ', 2: 'B', 3: 'MULTIPLE' }, { 1: 'A', 2: 'D', 3: 'C' }, 3);
  assert.deepEqual(score, { score: 1, totalItems: 3, percentage: 33.3 });
  assert.equal(isAnswerCorrect(['a', 'B'], ['A', 'B'], 1), true);
  assert.equal(percentageToMps(50), 51);
});

test('missing keys and invalid marks count as wrong, and empty tests do not divide by zero', () => {
  assert.deepEqual(calculateAssessmentScore({ 1: 'A' }, {}, 1), { score: 0, totalItems: 1, percentage: 0 });
  assert.deepEqual(calculateAssessmentScore({}, {}, 0), { score: 0, totalItems: 0, percentage: 0 });
  assert.deepEqual(
    calculateAssessmentScore({ 1: 'A', 2: 'B' }, { 1: 'A', 2: 'B' }, 2, { 1: 'ERASED_MARK', 2: 'MULTIPLE_MARK' }),
    { score: 0, totalItems: 2, percentage: 0 }
  );
});
