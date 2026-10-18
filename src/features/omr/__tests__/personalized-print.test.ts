import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { A5_TWO_UP_PRINT_SIZE, buildA5TwoUpPages } from '../rendering/personalized-print-layout';
import { renderOmrMasterSvg } from '../rendering/svg-renderer';

describe('Personalized A5 OMR print layout', () => {
  const geometry = generateCanonicalGeometry({
    assessmentId: 'a5-print-preview',
    title: 'Quarter 1 Assessment',
    subject: 'Mathematics',
    section: 'Grade 11 - Einstein',
    schoolYear: '2026-2027',
    term: 'Quarter 1',
    schoolName: 'Caps Senior High School',
    itemCount: 30,
    classSize: 30,
  });

  it('prints two named students on one A4 landscape page with A5 sheet geometry', () => {
    assert.deepStrictEqual(A5_TWO_UP_PRINT_SIZE, {
      pageWidthMm: 297,
      pageHeightMm: 210,
      sheetWidthMm: 148,
      sheetHeightMm: 210,
      cutLineMm: 148.5,
    });
    assert.strictEqual(A5_TWO_UP_PRINT_SIZE.sheetWidthMm * 2 + 1, A5_TWO_UP_PRINT_SIZE.pageWidthMm);
    assert.strictEqual(geometry.sheetFormat, 'HALF');
    assert.deepStrictEqual([geometry.page.width, geometry.page.height], [559, 794]);

    const students = [
      { id: 'student-001', name: 'Maria Santos' },
      { id: 'student-002', name: 'Juan Dela Cruz' },
    ];
    const pages = buildA5TwoUpPages(students, (student) =>
      renderOmrMasterSvg(geometry, {
        learnerName: student.name,
        studentId: student.id,
        visibleFields: { learnerName: true },
      })
    );

    assert.strictEqual((pages.match(/omr-print-page-landscape/g) || []).length, 1);
    assert.strictEqual((pages.match(/class="omr-sheet-half"/g) || []).length, 2);
    assert.match(pages, /CRUZ, JUAN DELA/);
    assert.match(pages, /SANTOS, MARIA/);
  });

  it('keeps an odd final student on a page with the second A5 half blank', () => {
    const pages = buildA5TwoUpPages(
      [{ id: 'student-001', name: 'Maria Santos' }],
      (student) => `<svg data-student="${student.id}"></svg>`
    );

    assert.strictEqual((pages.match(/omr-print-page-landscape/g) || []).length, 1);
    assert.strictEqual((pages.match(/class="omr-sheet-half"/g) || []).length, 2);
    assert.match(pages, /data-student="student-001"/);
    assert.match(pages, /<div class="omr-sheet-half"><\/div>/);
  });
});
