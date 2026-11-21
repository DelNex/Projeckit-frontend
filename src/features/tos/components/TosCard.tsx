'use client';

import { TosDocument } from '@/types/tos';
import {
  Eye,
  Edit2,
  Trash2,
  FileDown,
  FilePlus2,
  Users,
  MoreHorizontal,
} from 'lucide-react';

interface TosCardProps {
  tos: TosDocument;
  onView: (tos: TosDocument) => void;
  onEdit: (tos: TosDocument) => void;
  onCreateExam: (tos: TosDocument) => void;
  onDelete: (tos: TosDocument) => void;
  onDownloadWord?: (tos: TosDocument) => void;
  isExamGenerating?: boolean;
}

export function TosCard({
  tos,
  onView,
  onEdit,
  onCreateExam,
  onDelete,
  onDownloadWord,
  isExamGenerating = false,
}: TosCardProps) {
  const compCount = Array.isArray(tos.rows) ? tos.rows.length : 0;
  const totalDays = tos.total_days || tos.days_taught || (
    Array.isArray(tos.rows)
      ? tos.rows.reduce((sum: number, r: any) => sum + (Number(r.daysTaught || r.days) || 0), 0)
      : 0
  );

  // Format sections display
  let sectionDisplay = 'All Sections';
  if (Array.isArray(tos.sections) && tos.sections.length > 0) {
    if (tos.sections.length > 3) {
      sectionDisplay = `${tos.sections.length} sections (${tos.sections.slice(0, 2).map((s) => s.name).join(', ')}...)`;
    } else {
      sectionDisplay = tos.sections.map((s) => s.name).join(', ');
    }
  } else if (tos.section && tos.section.trim()) {
    sectionDisplay = tos.section.trim();
  }

  const examTypeTitle = tos.exam_type || 'Summative Test';
  const descriptionText = tos.description && tos.description !== tos.subject ? tos.description : "";

  return (
    <div className="flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-none transition-colors group">
      <div className="space-y-3">
        {/* Top Badges & Word download */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{tos.term} · {tos.subject}</span>
            {isExamGenerating && <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--pk-warning)]" />Exam is being generated</span>}
          </div>

          {onDownloadWord && (
            <button
              onClick={() => onDownloadWord(tos)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/40"
              title="Open to download Word"
              aria-label="Open to download Word"
            >
              <FileDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Title and Description */}
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
            {examTypeTitle}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
            {descriptionText}
          </p>
        </div>

        {/* Sections list */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">Section(s):</span>
          <span className="truncate">{sectionDisplay}</span>
        </div>

        {/* Stats line */}
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pt-1">
          {tos.target_items} items · {totalDays} instructional days · {compCount} {compCount === 1 ? 'competency' : 'competencies'}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onView(tos)}
            className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>View</span>
          </button>
          <button
            onClick={() => onEdit(tos)}
            className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onCreateExam(tos)}
            className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Create Exam</span>
          </button>
          <details className="relative">
            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="More TOS actions" title="More actions">
              <MoreHorizontal className="h-5 w-5" />
            </summary>
            <div className="absolute bottom-full right-0 z-20 mb-2 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <button type="button" onClick={() => onDelete(tos)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/40">
                <Trash2 className="h-4 w-4" /> Delete TOS
              </button>
              <p className="px-3 pb-2 text-[10px] text-slate-500 dark:text-slate-400">You will be asked to confirm before deletion.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
