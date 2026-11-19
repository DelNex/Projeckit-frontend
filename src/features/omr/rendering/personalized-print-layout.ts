import type { CanonicalOmrGeometry } from '../geometry/geometry-types';
import type { OmrPrintModalStudent } from '../components/OmrPrintModal';

export const A5_TWO_UP_PRINT_SIZE = {
  pageWidthMm: 297,
  pageHeightMm: 210,
  sheetWidthMm: 148,
  sheetHeightMm: 210,
  cutLineMm: 148.5,
} as const;

/** Render each roster pair as one A4-landscape page containing two A5 sheets. */
export function buildA5TwoUpPages(
  students: readonly OmrPrintModalStudent[],
  renderSheet: (student: OmrPrintModalStudent, index: number) => string
): string {
  const pages: string[] = [];

  for (let index = 0; index < students.length; index += 2) {
    const leftSheet = renderSheet(students[index], index);
    const rightStudent = students[index + 1];
    const rightSheet = rightStudent ? renderSheet(rightStudent, index + 1) : '';

    pages.push(`
      <div class="omr-print-page-landscape">
        <div class="omr-sheet-half">${leftSheet}</div>
        <div class="omr-cut-line"></div>
        <div class="omr-sheet-half">${rightSheet}</div>
      </div>
    `);
  }

  return pages.join('\n');
}


/**
 * Compact half-sheet printing keeps the original A5 width and scanner-sized
 * marks/barcode, but shortens the physical sheet when fewer answer rows are
 * needed. The result is tiled into the unused vertical space on A4 landscape.
 */
export function getA4CompactLayout(pageHeightPx: number) {
  const safeHeight = Math.max(1, Number(pageHeightPx) || 1);
  const sheetHeightMm = A5_TWO_UP_PRINT_SIZE.sheetHeightMm * (safeHeight / 794);
  const rowsPerPage = Math.max(1, Math.floor((A5_TWO_UP_PRINT_SIZE.pageHeightMm + 0.001) / sheetHeightMm));
  return {
    sheetHeightMm: Number(sheetHeightMm.toFixed(2)),
    rowsPerPage,
    sheetsPerPage: rowsPerPage * 2,
  };
}

/**
 * Tile complete half-width OMR forms on A4 landscape. Empty cells are retained
 * on the final page so every printed sheet keeps the same physical dimensions.
 */
export function buildA4CompactPages(
  sheetCount: number,
  rowsPerPage: number,
  sheetHeightMm: number,
  renderSheet: (index: number) => string
): string {
  const safeRows = Math.max(1, Math.floor(rowsPerPage));
  const capacity = safeRows * 2;
  const safeCount = Math.max(0, Math.floor(sheetCount));
  const pages: string[] = [];

  for (let pageStart = 0; pageStart < safeCount; pageStart += capacity) {
    const cells = Array.from({ length: capacity }, (_, offset) => {
      const index = pageStart + offset;
      const content = index < safeCount ? renderSheet(index) : '';
      return `<div class="omr-sheet-compact" style="width:148mm;height:${sheetHeightMm}mm;overflow:hidden">${content}</div>`;
    }).join('');
    const horizontalCuts = Array.from({ length: safeRows - 1 }, (_, row) =>
      `<div class="omr-compact-horizontal-cut" style="position:absolute;left:0;right:0;top:${((row + 1) * sheetHeightMm).toFixed(2)}mm;border-top:1px dashed #9CA3AF"></div>`
    ).join('');
    pages.push(`
      <div class="omr-print-page-compact" style="width:297mm;height:210mm;display:grid;grid-template-columns:148mm 148mm;grid-template-rows:repeat(${safeRows},${sheetHeightMm}mm);align-content:start;justify-content:space-between;position:relative;overflow:hidden;background:#fff">
        ${cells}
        <div class="omr-compact-vertical-cut" style="position:absolute;left:148.5mm;top:0;bottom:0;border-left:1px dashed #9CA3AF"></div>
        ${horizontalCuts}
      </div>
    `);
  }

  return pages.join('\n');
}


/**
 * Recover the unshifted content cursor from the base geometry and calculate
 * the shortest safe HALF sheet. A 60-item form deliberately returns its
 * original 794px A5 height.
 */
export function getCompactOmrPageHeight(geometry: CanonicalOmrGeometry): number {
  if (geometry.sheetFormat !== 'HALF' || geometry.config.itemCount >= 60) return geometry.page.height;
  const rowsPerColumn = geometry.layout.answerArea.rowsPerCol;
  const baseAnswerY = geometry.layout.answerArea.y;
  const shiftedSectionBottom = geometry.layout.sectionBar.bottomLineY;
  const contentCursorY = Math.max(0, 4 * shiftedSectionBottom - 3 * (baseAnswerY - 8));
  return Math.min(794, Math.max(1, Math.ceil(
    23 + contentCursorY + 8 + 26 + 16 + 19 * Math.max(0, rowsPerColumn - 1) + 2
  )));
}
