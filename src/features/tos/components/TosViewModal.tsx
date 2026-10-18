'use client';

import { useState, useMemo } from 'react';
import {
  X,
  FileDown,
  Sparkles,
  Printer,
  FileSpreadsheet,
  Layers,
  Table as TableIcon,
  CheckCircle2,
  AlertCircle,
  School,
  Calendar,
  User,
  Users,
} from 'lucide-react';
import { TosDocument } from '@/types/tos';
import * as mammoth from 'mammoth';
import {
  calculateTos,
  BLOOM_LEVELS,
  BLOOM_LEVEL_LABELS,
  CalculatedCompetencyRow,
  validateItemPlacementUniqueness,
} from '@/lib/tos-calculator';
import { generateOfficialTosDocx, downloadBlob } from '../word-export';

interface TosViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  tos: TosDocument | null;
  schoolName: string;
  region?: string;
  division?: string;
  onCreateExam: (tos: TosDocument) => void;
}

export function TosViewModal({
  isOpen,
  onClose,
  tos,
  schoolName,
  region,
  division,
  onCreateExam,
}: TosViewModalProps) {
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [mobileCardView, setMobileCardView] = useState(false);

  // Compute live deterministic TOS allocation table
  const calcResult = useMemo(() => {
    if (!tos || !Array.isArray(tos.rows) || tos.rows.length === 0) {
      return null;
    }

    const comps = tos.rows.map((r, i) => ({
      id: r.id || String(i + 1),
      code: r.code || `COMP-${i + 1}`,
      description: r.description || `Competency ${i + 1}`,
      daysTaught: Math.max(1, Number(r.daysTaught || r.days) || 1),
    }));

    return calculateTos(comps, tos.target_items || 50, {
      allocationMode: 'action_verb',
      examType: tos.exam_type || 'Summative Test 1',
    });
  }, [tos]);

  if (!isOpen || !tos || !calcResult) return null;

  const rows: CalculatedCompetencyRow[] = calcResult.rows;
  const totalDays = rows.reduce((sum, r) => sum + r.daysTaught, 0);
  const totalItems = rows.reduce((sum, r) => sum + r.itemCount, 0);

  // Validate item placement uniqueness
  const uniqueness = validateItemPlacementUniqueness(calcResult);

  const handleDownloadWord = async () => {
    setIsExportingWord(true);
    try {
      const blob = await generateOfficialTosDocx(tos, rows, {
        schoolName,
        region,
        division,
        preparedBy: tos.teacher_name || 'Subject Teacher',
      });
      const cleanSubject = tos.subject.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `TOS_${cleanSubject}_${tos.school_year}.docx`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Failed to generate Word document:', err);
    } finally {
      setIsExportingWord(false);
    }
  };

  const handlePrint = async () => {
    // Open synchronously from the click handler so browser popup blockers allow
    // printing after the DOCX has been generated and converted for rendering.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      console.error('Allow popups for this site to export the TOS as PDF.');
      return;
    }

    setIsExportingPdf(true);
    printWindow.document.write('<!doctype html><title>Preparing TOS…</title><p style="font:16px sans-serif;padding:24px">Preparing the Word document for printing…</p>');
    printWindow.document.close();

    try {
      const docxBlob = await generateOfficialTosDocx(tos, rows, {
        schoolName,
        region,
        division,
        preparedBy: tos.teacher_name || 'Subject Teacher',
      });
      const arrayBuffer = await docxBlob.arrayBuffer();
      const converted = await mammoth.convertToHtml({ arrayBuffer });
      const cleanSubject = tos.subject.replace(/[^a-zA-Z0-9]/g, '_');
      const title = `TOS_${cleanSubject}_${tos.school_year}`.replace(/[&<>"']/g, '');

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { color: #111; background: #fff; font: 10pt Arial, sans-serif; line-height: 1.35; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0; }
  th, td { border: 1px solid #333; padding: 5px 6px; vertical-align: middle; overflow-wrap: anywhere; }
  th { font-weight: 700; text-align: center; }
  p { margin: 4px 0; }
  tr { break-inside: avoid; }
  @media screen { body { max-width: 1100px; margin: 24px auto; padding: 24px; } }
</style></head><body>${converted.value}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.setTimeout(() => printWindow.print(), 500);
    } catch (error) {
      printWindow.close();
      console.error('Failed to prepare the Word TOS for PDF printing:', error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const sectionsDisplay = Array.isArray(tos.sections) && tos.sections.length > 0
    ? tos.sections.map((s) => s.name).join(', ')
    : tos.section || 'All Sections';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full sm:max-w-5xl h-full sm:h-auto sm:max-h-[92vh] bg-white dark:bg-slate-900 sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <span>Table of Specification</span>
            </h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="font-semibold text-slate-900 dark:text-white uppercase">
                {tos.exam_type || 'Summative Test'} • {tos.subject}
              </span>
              <span>•</span>
              <span>{tos.term}</span>
              <span>•</span>
              <span>S.Y. {tos.school_year}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile View Toggle */}
            <div className="sm:hidden">
              <button
                onClick={() => setMobileCardView(!mobileCardView)}
                className="p-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1"
              >
                {mobileCardView ? <TableIcon className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                <span>{mobileCardView ? 'Table' : 'Cards'}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Official Matrix */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 print:p-0">
          {/* Document Summary Info Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <span className="font-medium text-slate-400">School: </span>
              <span className="font-bold text-slate-900 dark:text-white">{schoolName}</span>
            </div>
            <div>
              <span className="font-medium text-slate-400">Teacher: </span>
              <span className="font-bold text-slate-900 dark:text-white">{tos.teacher_name || 'Subject Teacher'}</span>
            </div>
            <div>
              <span className="font-medium text-slate-400">Section(s): </span>
              <span className="font-bold text-slate-900 dark:text-white">{sectionsDisplay}</span>
            </div>
            <div>
              <span className="font-medium text-slate-400">Allocation: </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {totalItems} items ({totalDays} days)
              </span>
            </div>
          </div>

          {/* Validation Alert if any duplicate/missing item numbers */}
          {!uniqueness.valid && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
              Warning: Item placement numbers have a discrepancy: missing {uniqueness.missing.join(', ')}
            </div>
          )}

          {/* Mobile Card View (When enabled on small screens) */}
          {mobileCardView ? (
            <div className="space-y-4 sm:hidden">
              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-600">Competency {idx + 1}</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {row.itemCount} items ({row.percentage}%)
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{row.description}</p>
                  <div className="text-[11px] text-slate-500">{row.daysTaught} instructional days</div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 gap-2 text-[11px]">
                    {BLOOM_LEVELS.map((level) => (
                      <div key={level} className="flex flex-col p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          {BLOOM_LEVEL_LABELS[level]}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {row.domainDisplay[level]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Official DepEd Responsive Table (Copy screenshot 7) */
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  {/* Spanning Header Row */}
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th rowSpan={2} className="p-3 w-10 text-center sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 border-r border-slate-200 dark:border-slate-700">
                      No.
                    </th>
                    <th rowSpan={2} className="p-3 min-w-[220px] sticky left-10 bg-slate-100 dark:bg-slate-800 z-10 border-r border-slate-200 dark:border-slate-700">
                      LEARNING COMPETENCIES
                    </th>
                    <th rowSpan={2} className="p-3 w-20 text-center border-r border-slate-200 dark:border-slate-700 leading-tight">
                      NUMBER OF DAYS TAUGHT
                    </th>
                    <th rowSpan={2} className="p-3 w-16 text-center border-r border-slate-200 dark:border-slate-700 leading-tight">
                      ITEM %
                    </th>
                    <th rowSpan={2} className="p-3 w-20 text-center border-r border-slate-200 dark:border-slate-700 leading-tight">
                      NUMBER OF ITEMS
                    </th>
                    <th colSpan={6} className="p-2.5 text-center bg-slate-200/80 dark:bg-slate-700 text-slate-900 dark:text-white font-black tracking-wide border-b border-slate-300 dark:border-slate-600">
                      BLOOM&apos;S TAXONOMY / ITEM PLACEMENT
                    </th>
                  </tr>
                  {/* Bloom Sub-Header */}
                  <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    {BLOOM_LEVELS.map((level) => (
                      <th key={level} className="p-2 text-center min-w-[70px] border-r last:border-r-0 border-slate-200 dark:border-slate-700">
                        {BLOOM_LEVEL_LABELS[level].toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {rows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800">
                        {index + 1}
                      </td>
                      <td className="p-3 font-medium text-slate-900 dark:text-slate-100 sticky left-10 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800">
                        {row.description}
                      </td>
                      <td className="p-3 text-center font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">
                        {row.daysTaught}
                      </td>
                      <td className="p-3 text-center font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">
                        {row.percentage}%
                      </td>
                      <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400 border-r border-slate-100 dark:border-slate-800">
                        {row.itemCount}
                      </td>
                      {BLOOM_LEVELS.map((level) => (
                        <td
                          key={level}
                          className="p-3 text-center font-mono font-medium text-slate-800 dark:text-slate-200 border-r last:border-r-0 border-slate-100 dark:border-slate-800"
                        >
                          {row.domainDisplay[level]}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* TOTAL Row */}
                  <tr className="bg-slate-50 dark:bg-slate-800/80 font-black text-slate-900 dark:text-white border-t-2 border-slate-200 dark:border-slate-700">
                    <td colSpan={2} className="p-3 text-center uppercase tracking-wider sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 border-r border-slate-200 dark:border-slate-700">
                      TOTAL
                    </td>
                    <td className="p-3 text-center border-r border-slate-200 dark:border-slate-700">
                      {totalDays}
                    </td>
                    <td className="p-3 text-center border-r border-slate-200 dark:border-slate-700">
                      100%
                    </td>
                    <td className="p-3 text-center text-emerald-600 dark:text-emerald-400 border-r border-slate-200 dark:border-slate-700">
                      {totalItems}
                    </td>
                    {BLOOM_LEVELS.map((level) => {
                      const levelCount = rows.reduce((sum, r) => sum + r.domains[level], 0);
                      return (
                        <td key={level} className="p-3 text-center border-r last:border-r-0 border-slate-200 dark:border-slate-700">
                          {levelCount}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer (Word Export, Create Exam, Print/PDF) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleDownloadWord}
              disabled={isExportingWord}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm transition-all w-full sm:w-auto"
            >
              <FileDown className="h-4 w-4 text-blue-600" />
              <span>{isExportingWord ? 'Exporting...' : 'Download Official Word TOS'}</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isExportingPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Print or Save as PDF"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">{isExportingPdf ? 'Preparing PDF…' : 'Word to PDF'}</span>
            </button>
          </div>

          <button
            onClick={() => {
              onClose();
              onCreateExam(tos);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all w-full sm:w-auto"
          >
            <Sparkles className="h-4 w-4" />
            <span>Create Examination from this TOS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
