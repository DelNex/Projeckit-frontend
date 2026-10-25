import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSectionAverage,
  calculateSectionTermMetrics,
  deduplicateScoredResponses,
  readSelectedOption,
  type SavedAssessmentResponse,
} from '../term-report-metrics';

function responses(count: number, totalScore: number, assessmentId: string, sectionName: string): SavedAssessmentResponse[] {
  const scores = Array.from({ length: count }, () => Math.floor(totalScore / count));
  scores[0] += totalScore - scores.reduce((sum, score) => sum + score, 0);
  return scores.map((score, index) => ({
    id: `${assessmentId}-${index}`,
    assessment_id: assessmentId,
    student_id: `student-${assessmentId}-${index}`,
    student_lrn: null,
    section_name: sectionName,
    score,
    status: 'GRADED',
    scanned_at: `2026-10-25T00:${String(index).padStart(2, '0')}:00.000Z`,
  }));
}

describe('term report calculation rules', () => {
  it('matches the supplied screenshot and rounds only after using full precision', () => {
    const ezekiel = calculateSectionTermMetrics('ICT 12 - EZEKIEL', responses(36, 1096, 'a', 'ICT 12 - EZEKIEL'), 60);
    const peter = calculateSectionTermMetrics('ICT 12 - PETER', responses(37, 1267, 'b', 'ICT 12 - PETER'), 60);

    assert.equal(ezekiel.cases, 36);
    assert.equal(ezekiel.mean?.toFixed(2), '30.44');
    assert.equal(ezekiel.pl?.toFixed(2), '50.74');
    assert.equal(ezekiel.mps?.toFixed(2), '51.73');
    assert.equal(peter.cases, 37);
    assert.equal(peter.mean?.toFixed(2), '34.24');
    assert.equal(peter.pl?.toFixed(2), '57.07');
    assert.equal(peter.mps?.toFixed(2), '57.93');

    const average = calculateSectionAverage([ezekiel, peter]);
    assert.equal(average.mean?.toFixed(2), '32.34');
    assert.equal(average.pl?.toFixed(2), '53.91');
    assert.equal(average.mps?.toFixed(2), '54.83');
  });

  it('counts each learner once per assessment and uses the latest graded response', () => {
    const rows: SavedAssessmentResponse[] = [
      { id: 'old', assessment_id: 'a', student_id: 's1', student_lrn: null, score: 10, status: 'GRADED', scanned_at: '2026-10-20T00:00:00Z' },
      { id: 'new', assessment_id: 'a', student_id: 's1', student_lrn: null, score: 20, status: 'EVALUATED', scanned_at: '2026-10-21T00:00:00Z' },
      { id: 'pending', assessment_id: 'a', student_id: 's2', student_lrn: null, score: 15, status: 'PENDING', scanned_at: '2026-10-22T00:00:00Z' },
      { id: 'anonymous', assessment_id: 'a', student_id: null, student_lrn: null, score: 15, status: 'GRADED', scanned_at: '2026-10-22T00:00:00Z' },
      { id: 'same-lrn', assessment_id: 'a', student_id: null, student_lrn: ' 123 ', score: 12, status: 'GRADED', scanned_at: '2026-10-21T00:00:00Z' },
      { id: 'same-lrn-new', assessment_id: 'a', student_id: null, student_lrn: '123', score: 14, status: 'GRADED', scanned_at: '2026-10-22T00:00:00Z' },
    ];
    const deduplicated = deduplicateScoredResponses(rows);
    assert.equal(deduplicated.length, 2);
    assert.deepEqual(deduplicated.map((row) => row.id).sort(), ['new', 'same-lrn-new']);
  });

  it('reads both array and object answer formats and avoids divide-by-zero output', () => {
    assert.equal(readSelectedOption(['a', 'C'], 2), 'C');
    assert.equal(readSelectedOption({ '1': 'd' }, 1), 'D');
    const empty = calculateSectionTermMetrics('No cases', [], 60);
    assert.equal(empty.mean, null);
    assert.equal(empty.pl, null);
    assert.equal(empty.mps, null);
  });
});
