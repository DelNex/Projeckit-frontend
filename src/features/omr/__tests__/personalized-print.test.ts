import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { A5_TWO_UP_PRINT_SIZE, buildA5TwoUpPages, buildA4CompactPages, getA4CompactLayout, getCompactOmrPageHeight } from '../rendering/personalized-print-layout';
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
    itemCount: 60,
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


describe('Compact A4 OMR printing', () => {
  it('keeps full-height 60-item sheets at exactly two per A4 landscape page', () => {
    const layout = getA4CompactLayout(794);
    assert.deepStrictEqual(layout, { sheetHeightMm: 210, rowsPerPage: 1, sheetsPerPage: 2 });
  });

  it('fits additional complete forms when a compact sheet is shorter', () => {
    const layout = getA4CompactLayout(320);
    assert.ok(layout.rowsPerPage >= 2);
    assert.strictEqual(layout.sheetsPerPage, layout.rowsPerPage * 2);
    const html = buildA4CompactPages(layout.sheetsPerPage, layout.rowsPerPage, layout.sheetHeightMm, (index) =>
      `<svg data-student="${index + 1}"></svg>`
    );
    assert.strictEqual((html.match(/class="omr-sheet-compact"/g) || []).length, layout.sheetsPerPage);
    assert.strictEqual((html.match(/data-student=/g) || []).length, layout.sheetsPerPage);
    assert.match(html, /omr-compact-vertical-cut/);
  });

  it('leaves empty cells instead of stretching the last form', () => {
    const html = buildA4CompactPages(1, 2, 90, () => '<svg data-student="1"></svg>');
    assert.strictEqual((html.match(/class="omr-sheet-compact"/g) || []).length, 4);
    assert.strictEqual((html.match(/data-student=/g) || []).length, 1);
  });
});


describe('Compact canonical OMR geometry', () => {
  const makeGeometry = (itemCount: number, pageHeight?: number) => generateCanonicalGeometry({
    assessmentId: `compact-${itemCount}`,
    itemCount,
    classSize: 40,
    title: 'Quarter 1 Test',
    subject: 'Mathematics',
    ...(pageHeight ? { pageHeight } : {}),
  });

  it('preserves the original 60-item A5 physical geometry', () => {
    const full = makeGeometry(60);
    assert.strictEqual(getCompactOmrPageHeight(full), 794);
    assert.deepStrictEqual([full.page.width, full.page.height], [559, 794]);
  });

  it('shortens a 10-item form enough to fit additional students per page', () => {
    const base = makeGeometry(10, 794);
    const compact = makeGeometry(10);
    const compactHeight = getCompactOmrPageHeight(base);
    const layout = getA4CompactLayout(compact.page.height);
    assert.strictEqual(compact.page.height, compactHeight);
    assert.ok(compact.page.height < 794);
    assert.ok(layout.sheetsPerPage > 2);
    assert.strictEqual(compact.layout.answerArea.markerSize, base.layout.answerArea.markerSize);
    assert.strictEqual(compact.layout.barcode.narrowBarWidth, base.layout.barcode.narrowBarWidth);
    assert.strictEqual(compact.layout.barcode.height, base.layout.barcode.height);
    assert.strictEqual(compact.page.width, base.page.width);
  });
});
