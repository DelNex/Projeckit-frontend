/**
 * Project KIT — OMR Results Verification & Correction Grid
 * Accessible, mobile-responsive interactive review component.
 * Allows teachers to inspect machine-classified bubbles, resolve ambiguous or multiple marks,
 * and assign the scan to a roster learner before persisting to Supabase.
 */

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, RefreshCw, Save, UserCheck, XCircle } from 'lucide-react';
import { OmrItemState, ProcessedItemResult } from '../../omr/types';

export interface RosterStudent {
  id: string;
  name: string;
  lrn?: string | null;
  section_name?: string | null;
}

export interface OmrResultsReviewProps {
  items: ProcessedItemResult[];
  choices?: string[];
  totalItems: number;
  overallConfidence: number;
  students: RosterStudent[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  onUpdateItem: (itemNumber: number, choice: string | null) => void;
  onSave: () => void;
  onScanAnother: () => void;
  isSaving: boolean;
  isAnswerKeyMode?: boolean;
}

export function OmrResultsReview({
  items,
  choices = ['A', 'B', 'C', 'D'],
  totalItems,
  overallConfidence,
  students,
  selectedStudentId,
  onSelectStudent,
  onUpdateItem,
  onSave,
  onScanAnother,
  isSaving,
  isAnswerKeyMode = false,
}: OmrResultsReviewProps) {
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const markedCount = items.filter((i) => i.selectedChoice && i.state === 'MARKED').length;
  const ambiguousCount = items.filter((i) => i.state === 'AMBIGUOUS').length;
  const multipleCount = items.filter((i) => i.state === 'MULTIPLE_MARK').length;
  const erasedCount = items.filter((i) => i.state === 'ERASED_MARK').length;
  const blankCount = items.filter((i) => !i.selectedChoice || i.state === 'BLANK').length;

  const hasIssues = ambiguousCount > 0 || multipleCount > 0 || erasedCount > 0;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Summary Bar */}
      <div className="rounded-2xl bg-gray-800/80 border border-gray-700/80 p-3.5 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-200">
              {isAnswerKeyMode ? 'Detected Answer Key' : 'Scan Results Verification'}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                overallConfidence >= 0.8
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : overallConfidence >= 0.6
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                  : 'bg-red-950/60 border-red-500/40 text-red-300'
              )}
            >
              {Math.round(overallConfidence * 100)}% Confidence
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-300">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {markedCount} Marked
            </span>
            {multipleCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                {multipleCount} Double
              </span>
            )}
            {ambiguousCount > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {ambiguousCount} Faint
              </span>
            )}
            <span className="text-gray-400">({blankCount} Blank)</span>
          </div>
        </div>

        {hasIssues && (
          <div className="rounded-xl bg-amber-950/40 border border-amber-800/60 p-2 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Tap any flagged item below to confirm or override the student's intended answer.
            </span>
          </div>
        )}
      </div>

      {/* Learner Assignment (Examinee Mode only) */}
      {!isAnswerKeyMode && (
        <div className="rounded-2xl bg-gray-800/60 border border-gray-700/80 p-3 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-blue-400" />
              <span>Assigned Learner:</span>
            </label>
            {selectedStudent ? (
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready to Persist
              </span>
            ) : (
              <span className="text-[11px] font-bold text-amber-400">
                * Please select a learner
              </span>
            )}
          </div>

          <select
            value={selectedStudentId}
            onChange={(e) => onSelectStudent(e.target.value)}
            className="w-full rounded-xl bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="">— Select learner from section roster —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.lrn ? `• LRN: ${s.lrn}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Answer Items Grid */}
      <div className="flex-1 overflow-y-auto max-h-[380px] sm:max-h-[440px] pr-1 space-y-2">
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {items.map((item) => {
            const isMarked = item.state === 'MARKED' && Boolean(item.selectedChoice);
            const isMultiple = item.state === 'MULTIPLE_MARK';
            const isAmbiguous = item.state === 'AMBIGUOUS';
            const isErased = item.state === 'ERASED_MARK';

            return (
              <div
                key={item.itemNumber}
                className={cn(
                  'rounded-xl border p-2 flex flex-col justify-between transition-all bg-gray-900/60',
                  isMultiple
                    ? 'border-red-600/80 bg-red-950/30'
                    : isAmbiguous
                    ? 'border-amber-600/80 bg-amber-950/30'
                    : isErased
                    ? 'border-orange-600/80 bg-orange-950/30'
                    : isMarked
                    ? 'border-emerald-600/60 bg-emerald-950/20'
                    : 'border-gray-800 hover:border-gray-700'
                )}
              >
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="font-bold text-gray-300">Item {item.itemNumber}</span>
                  {isMultiple ? (
                    <span className="text-[9px] font-bold text-red-400">MULTIPLE</span>
                  ) : isAmbiguous ? (
                    <span className="text-[9px] font-bold text-amber-400">FAINT</span>
                  ) : isErased ? (
                    <span className="text-[9px] font-bold text-orange-400">ERASED</span>
                  ) : (
                    <span className="text-[9px] font-semibold text-gray-500">
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                </div>

                {/* Choice Buttons for manual correction */}
                <div className="flex items-center justify-between gap-1">
                  {choices.map((choice) => {
                    const isSelected = item.selectedChoice === choice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => onUpdateItem(item.itemNumber, isSelected ? null : choice)}
                        className={cn(
                          'flex-1 py-1 rounded text-xs font-bold transition cursor-pointer text-center',
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                        )}
                      >
                        {choice}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    title="Mark as Blank"
                    onClick={() => onUpdateItem(item.itemNumber, null)}
                    className={cn(
                      'px-1.5 py-1 rounded text-[10px] font-bold transition cursor-pointer',
                      !item.selectedChoice
                        ? 'bg-gray-700 text-gray-200'
                        : 'text-gray-500 hover:text-gray-300'
                    )}
                  >
                    Ø
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-800 shrink-0">
        <button
          type="button"
          onClick={onScanAnother}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-xs font-bold text-gray-300 hover:bg-gray-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retake / Next Sheet</span>
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || (!isAnswerKeyMode && !selectedStudentId)}
          className={cn(
            'w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white transition shadow-sm',
            !isAnswerKeyMode && !selectedStudentId
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
          )}
        >
          {isSaving ? (
            <span>Saving Results…</span>
          ) : isAnswerKeyMode ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Apply Detected Answer Key</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Confirm & Save to Supabase</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

