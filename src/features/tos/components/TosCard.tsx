'use client';

import { TosDocument } from '@/types/tos';
import {
  Eye,
  Edit2,
  Sparkles,
  Trash2,
  FileText,
  Users,
  Calendar,
  Layers,
} from 'lucide-react';

interface TosCardProps {
  tos: TosDocument;
  onView: (tos: TosDocument) => void;
  onEdit: (tos: TosDocument) => void;
  onCreateExam: (tos: TosDocument) => void;
  onDelete: (tos: TosDocument) => void;
  onPrintPdf?: (tos: TosDocument) => void;
  isExamGenerating?: boolean;
}

export function TosCard({
  tos,
  onView,
  onEdit,
  onCreateExam,
  onDelete,
  onPrintPdf,
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
  const descriptionText = tos.description || tos.subject;

  return (
    <div className="flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
      <div className="space-y-3">
        {/* Top Badges & PDF Icon */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {tos.term}
            </span>
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-w-[200px] truncate"
              title={tos.subject}
            >
              {tos.subject}
            </span>
            {isExamGenerating && <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">Exam is being generated</span>}
          </div>

          {onPrintPdf && (
            <button
              onClick={() => onPrintPdf(tos)}
              className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors shrink-0"
              title="Print / Save as PDF"
              aria-label="Print or save TOS as PDF"
            >
              <FileText className="h-4 w-4" />
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
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>View</span>
          </button>
          <button
            onClick={() => onEdit(tos)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onCreateExam(tos)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg shadow-sm transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Create Exam</span>
          </button>
          <button
            onClick={() => onDelete(tos)}
            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
            title="Delete Table of Specification"
            aria-label="Delete Table of Specification"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
