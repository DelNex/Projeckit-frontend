'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Info,
  Loader2,
  RotateCcw,
  Trash2,
  X,
  XCircle,
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
  actionType: 'archive' | 'restore' | 'delete' | 'reject' | 'neutral';
  impactTitle?: string;
  impactText?: string;
  confirmTextMatch?: string;
  confirmTextPlaceholder?: string;
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
  impactTitle,
  impactText,
  confirmTextMatch,
  confirmTextPlaceholder,
  confirmLabel,
  cancelLabel = 'Cancel',
  isLoading = false,
}: ConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [typedConfirmation, setTypedConfirmation] = useState('');

  // Reset typed confirmation and focus Cancel button when opened
  useEffect(() => {
    if (isOpen) {
      setTypedConfirmation('');
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key handler & focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isLoading) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const isDelete = actionType === 'delete';
  const isArchive = actionType === 'archive';
  const isRestore = actionType === 'restore';
  const isReject = actionType === 'reject';
  const isNeutral = actionType === 'neutral';

  const defaultConfirmLabel = isDelete
    ? affectedCount && affectedCount > 1
      ? `Permanently Delete (${affectedCount})`
      : 'Permanently Delete'
    : isArchive
    ? affectedCount && affectedCount > 1
      ? `Archive Selected (${affectedCount})`
      : 'Archive Record'
    : isRestore
    ? affectedCount && affectedCount > 1
      ? `Restore Selected (${affectedCount})`
      : 'Restore Record'
    : isReject
    ? affectedCount && affectedCount > 1
      ? `Reject (${affectedCount})`
      : 'Reject'
    : affectedCount && affectedCount > 1
    ? `Confirm (${affectedCount})`
    : 'Confirm';

  const isConfirmDisabled =
    isLoading ||
    (Boolean(confirmTextMatch) && typedConfirmation.trim() !== confirmTextMatch?.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 transition-all scale-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs',
                isDelete && 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400',
                isArchive && 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
                isRestore && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
                isReject && 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
                isNeutral && 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
              )}
            >
              {isDelete && <Trash2 className="h-5 w-5" />}
              {isArchive && <Archive className="h-5 w-5" />}
              {isRestore && <RotateCcw className="h-5 w-5" />}
              {isReject && <XCircle className="h-5 w-5" />}
              {isNeutral && <Info className="h-5 w-5" />}
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
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition disabled:opacity-40"
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
          {impactTitle || impactText ? (
            <div className="rounded-2xl p-3.5 text-xs flex items-start gap-2.5 border border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                {impactTitle && <strong className="font-semibold block mb-0.5">{impactTitle}</strong>}
                {impactText && <span>{impactText}</span>}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'rounded-2xl p-3.5 text-xs flex items-start gap-2.5 border',
                isDelete &&
                  'border-red-200 bg-red-50/70 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
                isArchive &&
                  'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
                isRestore &&
                  'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
                isReject &&
                  'border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
                isNeutral &&
                  'border-blue-200 bg-blue-50/70 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300'
              )}
            >
              {isDelete ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              ) : isReject ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              ) : isNeutral ? (
                <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
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
                {isReject && (
                  <>
                    <strong className="font-semibold block mb-0.5">Access Rejection:</strong>
                    This user registration request will be denied and their access blocked.
                  </>
                )}
                {isNeutral && (
                  <>
                    <strong className="font-semibold block mb-0.5">Confirmation Required:</strong>
                    Please verify the details before proceeding with this action.
                  </>
                )}
              </div>
            </div>
          )}

          {/* Optional Typed Confirmation Requirement */}
          {confirmTextMatch && (
            <div className="pt-2 space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                To confirm deletion, type <span className="font-mono font-bold text-red-600 dark:text-red-400 select-all">{confirmTextMatch}</span> below:
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder={confirmTextPlaceholder || confirmTextMatch}
                disabled={isLoading}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2 text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition disabled:opacity-50"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button
            ref={cancelButtonRef}
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
            disabled={isConfirmDisabled}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed',
              (isDelete || isReject) && 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
              isArchive && 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 text-white',
              isRestore && 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20',
              isNeutral && 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
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
