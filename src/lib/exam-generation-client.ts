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
  const deadline = Date.now() + 60 * 60 * 1000;
  const { lessonText: _lessonText, lessonDocuments: _lessonDocuments, files: _files, ...pollPayload } = payload;
  let helperJobId: string | undefined;
  let currentPayload = payload;

  while (Date.now() < deadline) {
    const response = await fetch('/api/ai/generate-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentPayload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      cache: 'no-store',
    });
    const responseText = await response.text();
    let result: ExamGenerationResult = {};
    try {
      result = JSON.parse(responseText) as ExamGenerationResult;
    } catch {
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

    if (!response.ok) throw new Error(result.error || 'The AI service could not generate this exam.');
    return result as ExamGenerationResult;
  }

  throw new Error(helperJobId
    ? 'Gemini is taking longer than expected. The job may still be running; wait a little and try again.'
    : 'The AI service timed out. Please try again.');
}
