export const EXAM_DRAFT_DEBOUNCE_MS = 1500;

export function examDraftRetryDelay(retries: number): number {
  return retries > 0 ? Math.min(8000, EXAM_DRAFT_DEBOUNCE_MS * 2 ** retries) : EXAM_DRAFT_DEBOUNCE_MS;
}

export function isExamDraftConflict(status: number, message: string): boolean {
  return status === 409 && message.toLowerCase().includes('newer version');
}

export function shouldWarnBeforeClosing(hasUnsavedChanges: boolean): boolean {
  return hasUnsavedChanges;
}
