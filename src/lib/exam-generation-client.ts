import type { ExamQuestion } from '@/lib/exam-types';

export interface ExamGenerationResult {
  success?: boolean;
  questions?: ExamQuestion[];
  question?: ExamQuestion;
  source?: string;
  isSampleDemo?: boolean;
  missingItemNumbers?: number[];
  error?: string;
  [key: string]: unknown;
}

type HelperProgress = { label?: string; completedChunks?: number; totalChunks?: number };
type ProgressCallback = (status: 'queued' | 'running', progress?: HelperProgress) => void;

/** Starts exam generation and polls the authenticated server while the local Gemini browser works. */
export async function generateExamThroughApi(
  payload: Record<string, unknown>,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExamGenerationResult> {
  // Long lesson documents are summarized one section at a time in the laptop
  // helper. Keep polling long enough for those jobs to finish without turning
  // a slow but healthy Gemini response into an AI-unavailable error.
  const deadline = Date.now() + 8 * 60 * 60 * 1000;
  const { lessonText: _lessonText, lessonDocuments: _lessonDocuments, files: _files, ...pollPayload } = payload;
  let helperJobId: string | undefined;
  let currentPayload = payload;

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPayload),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        cache: 'no-store',
      });
    } catch (error) {
      if (!helperJobId || signal?.aborted) throw error;
      onProgress?.('running', { label: 'Connection interrupted. Reconnecting to the Gemini helper…' });
      await new Promise<void>((resolve, reject) => {
        const finish = (callback: () => void) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          callback();
        };
        const timer = setTimeout(() => finish(resolve), 5000);
        const onAbort = () => finish(() => reject(new DOMException('Generation cancelled.', 'AbortError')));
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
      continue;
    }
    const responseText = await response.text();
    let result: ExamGenerationResult = {};
    try {
      result = JSON.parse(responseText) as ExamGenerationResult;
    } catch {
      if (helperJobId && response.status >= 500) {
        onProgress?.('running', { label: 'The server is reconnecting to your Gemini job…' });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      throw new Error(response.status === 413
        ? 'The server rejected this request as too large. Lesson files are uploaded separately; please retry or contact support if this continues.'
        : 'The server returned an invalid response while generating the exam. Please try again or contact support if it continues.');
    }

    if (response.status === 202 && result.helperJobId) {
      helperJobId = result.helperJobId;
      onProgress?.(result.status === 'running' ? 'running' : 'queued', result.progress);
      currentPayload = { ...pollPayload, helperJobId };
      await new Promise<void>((resolve, reject) => {
        const finish = (callback: () => void) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          callback();
        };
        const timer = setTimeout(() => finish(resolve), 2500);
        const onAbort = () => finish(() => reject(new DOMException('Generation cancelled.', 'AbortError')));
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
      continue;
    }

    if (helperJobId && response.status >= 500 && result.status !== 'failed') {
      onProgress?.('running', { label: 'The server is reconnecting to your Gemini job…' });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    if (!response.ok) throw new Error(result.error || 'The AI service could not generate this exam.');
    return result as ExamGenerationResult;
  }

  throw new Error(helperJobId
    ? 'Gemini is still processing this exam. The helper job may still be running; reconnect and retry instead of starting another generation.'
    : 'The AI service timed out. Please try again.');
}
