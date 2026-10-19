/**
 * Project KIT — Dynamic OMR Master & Personalized Answer Sheet Print Modal
 * Supports:
 * 1. HALF sheet (A5 portrait, 559 x 794) for <= 60 items:
 *    Two sheets side by side on one A4 landscape page (1123 x 794) with dashed cut line.
 * 2. FULL sheet (A4 portrait, 794 x 1123) for 61..90 items:
 *    One sheet per page.
 * 3. Personalized Answer Sheets: pre-printed header, Code 39 barcode identifier,
 *    and multi-page batch printing.
 */

'use client';

import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Printer,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CanonicalOmrGeometry } from '../geometry/geometry-types';
import {
  PersonalizedSheetData,
  renderOmrMasterSvg,
  VisibleHeaderFields,
} from '../rendering/svg-renderer';
import { A5_TWO_UP_PRINT_SIZE, buildA5TwoUpPages } from '../rendering/personalized-print-layout';

export interface OmrPrintModalStudent {
  id: string;
  name: string;
  lrn?: string | null;
  section_name?: string | null;
  is_archived?: boolean;
}

export interface OmrPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  geometry: CanonicalOmrGeometry;
  students?: OmrPrintModalStudent[];
  assessment?: {
    id?: string;
    title?: string;
    subject?: string;
    section?: string;
    term?: string;
    school_year?: string;
  };
  teacherName?: string;
  schoolName?: string;
  region?: string;
  division?: string;
  logoData?: string;
  totalPoints?: number;
}

export function OmrPrintModal({
  isOpen,
  onClose,
  geometry,
  students = [],
  assessment,
  teacherName,
  schoolName,
  region,
  division,
  logoData,
  totalPoints,
}: OmrPrintModalProps) {
  const [printMode, setPrintMode] = useState<'blank' | 'personalized'>('personalized');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);

  // Today's date default YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [examDate, setExamDate] = useState(todayStr);

  // Field visibility toggles chosen by the teacher
  const [visibleFields, setVisibleFields] = useState<VisibleHeaderFields>({
    learnerName: true,
    lrn: true,
    section: true,
    examDate: true,
    subject: true,
    term: true,
    assessmentTitle: true,
    teacherName: true,
    schoolName: true,
  });

  // Filter learners for the active section, excluding archived, capped at 70
  const activeLearners = useMemo(() => {
    const targetSection = (assessment?.section || geometry?.config?.section || '').toLowerCase().trim();
    const filtered = students.filter((s) => {
      if (s.is_archived) return false;
      if (!targetSection) return true;
      return (s.section_name || '').toLowerCase().trim() === targetSection;
    });

    return filtered.slice(0, 70);
  }, [students, assessment?.section, geometry?.config?.section]);

  const isHalfSheet = geometry?.sheetFormat === 'HALF';
  const totalPages = isHalfSheet
    ? Math.max(1, Math.ceil(activeLearners.length / 2))
    : Math.max(1, activeLearners.length);

  useEffect(() => {
    if (isOpen) setPrintMode(activeLearners.length > 0 ? 'personalized' : 'blank');
  }, [isOpen, activeLearners.length]);

  // Build personalized config for a specific student
  const getStudentPersonalizedData = (
    student: OmrPrintModalStudent | null,
    rollIndex: number
  ): PersonalizedSheetData | undefined => {
    if (!student || printMode === 'blank') return undefined;

    return {
      learnerName: student.name,
      lrn: student.lrn || undefined,
      section: assessment?.section || geometry.config.section,
      examDate,
      subject: assessment?.subject || geometry.config.subject,
      term: assessment?.term || geometry.config.term,
      assessmentTitle: assessment?.title || geometry.config.title,
      teacherName: teacherName || undefined,
      schoolName: schoolName || undefined,
      region: region || undefined,
      division: division || undefined,
      logoData: logoData || undefined,
      totalPoints,
      studentId: student.id,
      rollNumber: rollIndex + 1,
      visibleFields,
    };
  };

  const blankSheetData: PersonalizedSheetData = {
    schoolName,
    region,
    division,
    logoData,
    totalPoints,
  };

  // Preview SVGs
  const previewSvgLeft = useMemo(() => {
    if (!geometry) return '';
    if (printMode === 'blank') {
      return renderOmrMasterSvg(geometry, blankSheetData);
    }
    const sIdx = isHalfSheet ? currentPageIdx * 2 : currentPageIdx;
    const student = activeLearners[sIdx] || null;
    return renderOmrMasterSvg(geometry, getStudentPersonalizedData(student, sIdx));
  }, [geometry, printMode, currentPageIdx, isHalfSheet, activeLearners, examDate, visibleFields, assessment, teacherName, schoolName, region, division, logoData, totalPoints]);

  const previewSvgRight = useMemo(() => {
    if (!geometry || !isHalfSheet) return '';
    if (printMode === 'blank') {
      return renderOmrMasterSvg(geometry, blankSheetData);
    }
    const sIdx = currentPageIdx * 2 + 1;
    const student = activeLearners[sIdx] || null;
    if (!student) return '';
    return renderOmrMasterSvg(geometry, getStudentPersonalizedData(student, sIdx));
  }, [geometry, printMode, currentPageIdx, isHalfSheet, activeLearners, examDate, visibleFields, assessment, teacherName, schoolName, region, division, logoData, totalPoints]);

  if (!isOpen || !geometry) return null;

  const toggleField = (field: keyof VisibleHeaderFields) => {
    setVisibleFields((prev) => ({
      ...prev,
      [field]: prev[field] === false ? true : false,
    }));
  };

  const handlePrint = () => {
    let pagesHtml = '';

    if (isHalfSheet) {
      // 2 half sheets side by side on A4 landscape (1123 x 794)
      if (printMode === 'blank') {
        const svg = renderOmrMasterSvg(geometry, blankSheetData);
        pagesHtml = `
          <div class="omr-print-page-landscape">
            <div class="omr-sheet-half">${svg}</div>
            <div class="omr-cut-line"></div>
            <div class="omr-sheet-half">${svg}</div>
          </div>
        `;
      } else {
        if (activeLearners.length === 0) {
          alert('No enrolled active learners found for this section.');
          return;
        }

        pagesHtml = buildA5TwoUpPages(activeLearners, (student, studentIndex) => {
          const studentData = getStudentPersonalizedData(student, studentIndex);
          return renderOmrMasterSvg(geometry, studentData);
        });
      }
    } else {
      // Full sheet (A4 portrait, 794 x 1123)
      if (printMode === 'blank') {
        const svg = renderOmrMasterSvg(geometry, blankSheetData);
        pagesHtml = `<div class="omr-print-page-portrait">${svg}</div>`;
      } else {
        if (activeLearners.length === 0) {
          alert('No enrolled active learners found for this section.');
          return;
        }

        pagesHtml = activeLearners
          .map((student, idx) => {
            const studentData = getStudentPersonalizedData(student, idx);
            const svg = renderOmrMasterSvg(geometry, studentData);
            return `<div class="omr-print-page-portrait">${svg}</div>`;
          })
          .join('\n');
      }
    }

    const pageSizeCss = isHalfSheet ? 'A4 landscape' : 'A4 portrait';

    const printHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${geometry.templateId} — ${printMode === 'personalized' ? `Personalized Sheets (${activeLearners.length})` : 'Master Sheet'}</title>
    <style>
      @page {
        size: ${pageSizeCss};
        margin: 0;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        width: 100%;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .omr-print-page-landscape {
        width: ${A5_TWO_UP_PRINT_SIZE.pageWidthMm}mm;
        height: ${A5_TWO_UP_PRINT_SIZE.pageHeightMm}mm;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: stretch;
        position: relative;
        page-break-after: always;
        break-after: page;
        background: #ffffff;
      }
      .omr-print-page-landscape:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .omr-sheet-half {
        width: ${A5_TWO_UP_PRINT_SIZE.sheetWidthMm}mm;
        height: ${A5_TWO_UP_PRINT_SIZE.sheetHeightMm}mm;
        flex-shrink: 0;
      }
      .omr-sheet-half svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .omr-cut-line {
        position: absolute;
        left: ${A5_TWO_UP_PRINT_SIZE.cutLineMm}mm;
        top: 0;
        bottom: 0;
        width: 0;
        border-left: 1px dashed #9CA3AF;
      }
      .omr-print-page-portrait {
        width: 210mm;
        height: 297mm;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: #ffffff;
        page-break-after: always;
        break-after: page;
      }
      .omr-print-page-portrait:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .omr-print-page-portrait svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    ${pagesHtml}
    <script>
      window.addEventListener('load', function () {
        window.print();
        setTimeout(function () { window.close(); }, 1500);
      });
    </script>
  </body>
</html>`;

    const blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const printTab = window.open(blobUrl, '_blank');
    if (!printTab) {
      URL.revokeObjectURL(blobUrl);
      alert('Popups are blocked. Please allow popups for this site to print.');
      return;
    }

    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative flex flex-col w-full max-w-5xl h-[95vh] sm:h-[92vh] rounded-3xl bg-gray-900 border border-gray-800 shadow-2xl text-white overflow-hidden">
        {/* Modal Header */}
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 px-4 sm:px-6 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold truncate">Print Answer Sheets</h3>
              {/* Mode Pills */}
              <div className="inline-flex items-center rounded-xl bg-gray-800 p-0.5 border border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('blank');
                    setCurrentPageIdx(0);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    printMode === 'blank'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Blank Master
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('personalized');
                    setCurrentPageIdx(0);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    printMode === 'personalized'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  Personalized ({activeLearners.length})
                </button>
              </div>

              {/* Format Badge */}
              <span className="rounded-md bg-gray-800 px-2 py-0.5 text-[11px] font-mono font-medium text-gray-300 border border-gray-700">
                {isHalfSheet ? 'A5 Half (2 per A4 Landscape)' : 'A4 Full Sheet'}
              </span>
            </div>

            <p className="text-xs text-gray-400 mt-1 truncate">
              {printMode === 'blank' ? (
                <>Blank master sheet with empty underlines for learner info.</>
              ) : (
                <>
                  Pre-printed for <span className="text-emerald-400 font-semibold">{activeLearners.length} learners</span> • Section:{' '}
                  {assessment?.section || geometry.config.section || 'All'} • Cap 70
                </>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
            {printMode === 'personalized' && (
              <button
                type="button"
                onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition border ${
                  showConfigDrawer
                    ? 'bg-gray-800 text-white border-blue-500'
                    : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Customize Fields
              </button>
            )}

            <button
              onClick={handlePrint}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition ${
                printMode === 'personalized'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Printer className="h-4 w-4" />
              <span>
                {printMode === 'personalized'
                  ? `Print All (${activeLearners.length} Sheets)`
                  : 'Print Sheet'}
              </span>
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Personalized Field Customization Drawer */}
        {printMode === 'personalized' && showConfigDrawer && (
          <div className="shrink-0 border-b border-gray-800 bg-gray-900/90 px-4 sm:px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-300">Exam Date:</span>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="rounded-lg bg-gray-800 border border-gray-700 px-2.5 py-1 text-xs text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-gray-400">Show on header:</span>
                {(
                  [
                    ['lrn', 'LRN'],
                    ['section', 'Section'],
                    ['examDate', 'Exam Date'],
                    ['teacherName', 'Teacher'],
                    ['schoolName', 'School Name'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer text-gray-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={visibleFields[key] !== false}
                      onChange={() => toggleField(key)}
                      className="rounded-sm border-gray-700 bg-gray-800 text-blue-600 focus:ring-0"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pager Bar for Personalized Preview */}
        {printMode === 'personalized' && activeLearners.length > 0 && (
          <div className="shrink-0 flex items-center justify-between bg-gray-900/60 border-b border-gray-800/80 px-4 sm:px-6 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-300">Previewing Page:</span>
              <span className="font-bold text-emerald-400">
                {isHalfSheet ? (
                  <>
                    Sheets #{currentPageIdx * 2 + 1}
                    {activeLearners[currentPageIdx * 2 + 1] ? ` & #${currentPageIdx * 2 + 2}` : ''}
                  </>
                ) : (
                  <>Sheet #{currentPageIdx + 1} — {activeLearners[currentPageIdx]?.name}</>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPageIdx <= 0}
                onClick={() => setCurrentPageIdx((prev) => Math.max(0, prev - 1))}
                className="p-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous Page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-mono text-gray-400 text-xs px-2">
                {currentPageIdx + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPageIdx >= totalPages - 1}
                onClick={() => setCurrentPageIdx((prev) => Math.min(totalPages - 1, prev + 1))}
                className="p-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Modal Body: Preview Container */}
        <div className="flex-1 min-h-0 overflow-auto bg-gray-950">
          <div className="p-4 sm:p-8 flex justify-center">
            {isHalfSheet ? (
              /* A4 Landscape 2-Up Container (1123 x 794) */
              <div
                className="relative bg-white rounded-lg shadow-2xl shrink-0 flex flex-row justify-between overflow-hidden"
                style={{ width: 1123, height: 794 }}
              >
                <div
                  className="w-[559px] h-[794px] shrink-0"
                  dangerouslySetInnerHTML={{ __html: previewSvgLeft }}
                />
                {/* Thin dashed cut line in center */}
                <div
                  className="absolute left-[561px] top-0 bottom-0 border-l border-dashed border-gray-400 pointer-events-none"
                  style={{ width: 0 }}
                />
                <div
                  className="w-[559px] h-[794px] shrink-0"
                  dangerouslySetInnerHTML={{ __html: previewSvgRight }}
                />
              </div>
            ) : (
              /* A4 Portrait Single Sheet (794 x 1123) */
              <div
                className="bg-white rounded-lg shadow-2xl shrink-0"
                style={{ width: 794, height: 1123 }}
                dangerouslySetInnerHTML={{ __html: previewSvgLeft }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-800 px-5 py-2 flex items-center justify-between text-[11px] text-gray-500 bg-gray-900 select-none">
          <span>↕ Scroll to view full page preview</span>
          <span className="font-mono">
            {isHalfSheet
              ? 'A4 Landscape (1123 × 794 px) · 2 A5 Sheets / Page'
              : 'A4 Portrait (794 × 1123 px) · 1 Sheet / Page'}
            {printMode === 'personalized' && ` · ${activeLearners.length} Learners (${totalPages} Pages)`}
          </span>
        </div>
      </div>
    </div>
  );
}
