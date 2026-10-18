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
