/**
 * Project KIT — Dynamic OMR Master & Personalized Answer Sheet Print Modal
 * Supports:
 * 1. Blank Master Answer Sheet (standard)
 * 2. Personalized Answer Sheets: One sheet per learner with pre-printed header,
 *    Code 39 machine-readable identifier, pre-shaded roll numbers, and multi-page batch print.
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
import { useMemo, useState } from 'react';
import { CanonicalOmrGeometry } from '../geometry/geometry-types';
import {
  PersonalizedSheetData,
  renderOmrMasterSvg,
  VisibleHeaderFields,
} from '../rendering/svg-renderer';

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
  const [printMode, setPrintMode] = useState<'blank' | 'personalized'>('blank');
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0);
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

    // If section match yielded 0, fall back to non-archived roster
    const roster = filtered.length > 0 ? filtered : students.filter((s) => !s.is_archived);
    return roster.slice(0, 70);
  }, [students, assessment?.section, geometry?.config?.section]);

  const currentStudent = activeLearners[currentStudentIdx] || activeLearners[0] || null;

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
      rollNumber: rollIndex + 1, // 1..classSize
      visibleFields,
    };
  };

  // Preview SVG for currently displayed page
  const previewSvg = useMemo(() => {
    if (!geometry) return '';
    if (printMode === 'blank') {
      return renderOmrMasterSvg(geometry, {
        schoolName,
        region,
        division,
        logoData,
        totalPoints,
      });
    }
    const studentData = getStudentPersonalizedData(currentStudent, currentStudentIdx);
    return renderOmrMasterSvg(geometry, studentData);
  }, [geometry, printMode, currentStudent, currentStudentIdx, examDate, visibleFields, assessment, teacherName, schoolName, region, division, logoData, totalPoints]);

  const printPageConfig = useMemo(() => {
    if (!geometry) return { paper: 'A4 portrait', viewport: 'a4' };
    const widthMm = geometry.page.width / 3.779528;
    const heightMm = geometry.page.height / 3.779528;

    if (heightMm > 297) {
      return {
        paper: `${Math.ceil(widthMm)}mm ${Math.ceil(heightMm)}mm`,
        viewport: 'long',
      };
    }

    if (widthMm <= 148 && heightMm <= 210) {
      return {
        paper: 'A5 portrait',
        viewport: 'a5',
      };
    }

    return {
      paper: 'A4 portrait',
      viewport: 'a4',
    };
  }, [geometry]);

  if (!isOpen || !geometry) return null;

  const toggleField = (field: keyof VisibleHeaderFields) => {
    setVisibleFields((prev) => ({
      ...prev,
      [field]: prev[field] === false ? true : false,
    }));
  };

  const handlePrint = () => {
    let pagesHtml = '';

    if (printMode === 'blank') {
      const blankSvg = renderOmrMasterSvg(geometry, {
        schoolName,
        region,
        division,
        logoData,
        totalPoints,
      });
      pagesHtml = `<div class="omr-print-page">${blankSvg}</div>`;
    } else {
      if (activeLearners.length === 0) {
        alert('No enrolled active learners found for this section.');
        return;
      }

      pagesHtml = activeLearners
        .map((student, idx) => {
          const studentData = getStudentPersonalizedData(student, idx);
          const svg = renderOmrMasterSvg(geometry, studentData);
          return `<div class="omr-print-page">${svg}</div>`;
        })
        .join('\n');
    }

    const printHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${geometry.templateId} — ${printMode === 'personalized' ? `Personalized Sheets (${activeLearners.length})` : 'Master Sheet'}</title>
    <style>
      @page {
        size: ${printPageConfig.paper};
        margin: 0;
      }
      *, *::before, *::after { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        width: 100%;
      }
      .omr-print-page {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: #ffffff;
        page-break-after: always;
        break-after: page;
      }
      .omr-print-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .omr-print-page svg {
        display: block;
        width: 100%;
        max-width: 100%;
        height: auto;
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
                  onClick={() => setPrintMode('blank')}
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
                  onClick={() => setPrintMode('personalized')}
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
            </div>
            <p className="text-xs text-gray-400 truncate mt-1">
              {printMode === 'blank' ? (
                <>
                  Template: <span className="font-mono text-blue-400">{geometry.templateId}</span> • Items:{' '}
                  {geometry.config.itemCount} • Class Size: {geometry.config.classSize}
                </>
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
                    ['learnerName', 'Learner Name'],
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
              <span className="font-semibold text-gray-300">Previewing Learner:</span>
              <span className="font-bold text-emerald-400">
                #{currentStudentIdx + 1} — {currentStudent?.name || 'Unknown'}
              </span>
              {currentStudent?.lrn && (
                <span className="text-gray-500 font-mono text-[11px]">(LRN: {currentStudent.lrn})</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentStudentIdx <= 0}
                onClick={() => setCurrentStudentIdx((prev) => Math.max(0, prev - 1))}
                className="p-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous Learner"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-mono text-gray-400 text-xs px-2">
                {currentStudentIdx + 1} / {activeLearners.length}
              </span>
              <button
                type="button"
                disabled={currentStudentIdx >= activeLearners.length - 1}
                onClick={() => setCurrentStudentIdx((prev) => Math.min(activeLearners.length - 1, prev + 1))}
                className="p-1 rounded-lg bg-gray-800 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Learner"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 min-h-0 overflow-auto bg-gray-950">
          <div className="p-4 sm:p-8 flex justify-center">
            <div
              className="bg-white rounded-lg shadow-2xl shrink-0"
              style={{
                width: geometry.page.width,
                height: geometry.page.height,
              }}
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-800 px-5 py-2 flex items-center justify-between text-[11px] text-gray-500 bg-gray-900 select-none">
          <span>↕ Scroll to view full sheet</span>
          <span className="font-mono">
            {geometry.page.width} × {geometry.page.height} px · {printPageConfig.paper}
            {printMode === 'personalized' && ` · ${activeLearners.length} Pages`}
          </span>
        </div>
      </div>
    </div>
  );
}
