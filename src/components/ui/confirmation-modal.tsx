'use client';

import React from 'react';
import {
  AlertTriangle,
  Archive,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  affectedCount?: number;
  entityName?: string; // e.g. "learner", "learners", "section", "sections"
  actionType: 'archive' | 'restore' | 'delete';
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  affectedCount,
  entityName = 'record',
  actionType,
  confirmLabel,
  cancelLabel = 'Cancel',
  isLoading = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const isDelete = actionType === 'delete';
  const isArchive = actionType === 'archive';
  const isRestore = actionType === 'restore';

  const defaultConfirmLabel = isDelete
    ? affectedCount && affectedCount > 1
      ? `Permanently Delete (${affectedCount})`
      : 'Permanently Delete'
    : isArchive
    ? affectedCount && affectedCount > 1
      ? `Archive Selected (${affectedCount})`
      : 'Archive Record'
    : affectedCount && affectedCount > 1
    ? `Restore Selected (${affectedCount})`
    : 'Restore Record';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 transition-all scale-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs',
                isDelete && 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400',
                isArchive && 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
                isRestore && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
              )}
            >
              {isDelete && <Trash2 className="h-5 w-5" />}
              {isArchive && <Archive className="h-5 w-5" />}
              {isRestore && <RotateCcw className="h-5 w-5" />}
            </div>

            <div>
              <h3
                id="confirmation-modal-title"
                className="text-base font-bold text-gray-900 dark:text-white leading-tight"
              >
                {title}
              </h3>
              {affectedCount !== undefined && affectedCount > 0 && (
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {affectedCount} {entityName}
                  {affectedCount > 1 && !entityName.endsWith('s') ? 's' : ''} affected
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {description}
          </p>

          {/* Action Impact Warning Box */}
          <div
            className={cn(
              'rounded-2xl p-3.5 text-xs flex items-start gap-2.5 border',
              isDelete &&
                'border-red-200 bg-red-50/70 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
              isArchive &&
                'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
              isRestore &&
                'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
            )}
          >
            {isDelete ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            ) : (
              <Archive className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            )}
            <div className="text-[11px] leading-relaxed">
              {isDelete && (
                <>
                  <strong className="font-semibold block mb-0.5">Permanent &amp; Irreversible:</strong>
                  This action permanently erases the selected records from the database. It cannot be undone.
                </>
              )}
              {isArchive && (
                <>
                  <strong className="font-semibold block mb-0.5">Safe Soft Deletion:</strong>
                  The records will be removed from your active list and stored in the <strong>Archive</strong>. You can restore them anytime without losing historical data.
                </>
              )}
              {isRestore && (
                <>
                  <strong className="font-semibold block mb-0.5">Return to Active Roster:</strong>
                  These records will immediately reappear in your active workflow with all historical data and relationships intact.
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-50',
              isDelete && 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
              isArchive && 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 text-white',
              isRestore && 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
            )}
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{confirmLabel || defaultConfirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
