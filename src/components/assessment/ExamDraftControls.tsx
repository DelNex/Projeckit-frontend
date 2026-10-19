'use client';

import { ConfirmationModal } from '@/components/ui/confirmation-modal';

export function ExamDraftStatus({ text }: { text: string }) {
  return <span role="status" className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{text}</span>;
}

export function ExamDraftDialogs({
  conflict, confirmClose, loadNewerVersion, keepMyVersion, confirmDiscard, cancelDiscard, onClose,
}: {
  conflict: boolean; confirmClose: boolean; loadNewerVersion: () => void | Promise<void>;
  keepMyVersion: () => void | Promise<void>; confirmDiscard: (close: () => void) => void;
  cancelDiscard: () => void; onClose: () => void;
}) {
  return <>
    {conflict && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="exam-conflict-title">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <h2 id="exam-conflict-title" className="text-base font-bold text-gray-900 dark:text-white">A newer version was saved on another device</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">Choose which version of this exam draft to keep.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => void loadNewerVersion()} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">Load the newer version</button>
          <button type="button" onClick={() => void keepMyVersion()} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white">Keep my version (overwrite)</button>
        </div>
      </div>
    </div>}
    <ConfirmationModal isOpen={confirmClose} title="Discard unsaved exam changes?" description="Your latest edits have not been saved yet. Close anyway and discard them?" actionType="neutral" confirmLabel="Discard changes" cancelLabel="Keep editing" onConfirm={() => confirmDiscard(onClose)} onClose={cancelDiscard} />
  </>;
}
