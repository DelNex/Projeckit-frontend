/**
 * Project KIT — Server-side lesson document extraction.
 *
 * The browser only uploads original files and checks job progress.
 * PDF parsing, image OCR, and document extraction run on the backend.
 * Closing this page does not stop a queued extraction job.
 */

export interface LessonExtractionClientResult {
  text: string;
  documents: Array<{ name: string; text: string }>;
  charCount: number;
  filesProcessed: number;
  truncated: boolean;
  notice?: string;
}

export type LessonExtractionProgress = {
  stage: 'extracting' | 'ocr';
  progress: number;
  message: string;
  pageNumber?: number;
  pageCount?: number;
  fileIndex: number;
  fileCount: number;
  fileName: string;
};

type ExtractionJob = {
  id: string;
  fileName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: { stage?: string; percent?: number; label?: string };
  error_message?: string | null;
  documents?: Array<{ name: string; text: string; lowConfidencePages?: number[] }>;
};

const MAX_FILES = 5;
const MAX_CHARACTERS = 900_000;
const POLL_INTERVAL_MS = 2500;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message
      : typeof data.error === 'string' ? data.error
        : 'We could not start document processing. Please try again.';
    throw new Error(message);
  }
  return data;
}

async function waitForJob(
  job: { id: string; fileName: string },
  fileIndex: number,
  fileCount: number,
  onProgress?: (progress: LessonExtractionProgress) => void,
): Promise<NonNullable<ExtractionJob['documents']>[number]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const response = await fetch('/api/backend/ai/lesson-extraction/jobs/' + encodeURIComponent(job.id), {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await readJson(response) as ExtractionJob;

    const stage = data.progress?.stage === 'ocr' ? 'ocr' : 'extracting';
    onProgress?.({
      stage,
      progress: Math.max(0, Math.min(100, Number(data.progress?.percent || 0))),
      message: data.progress?.label || 'Processing ' + job.fileName,
      fileIndex,
      fileCount,
      fileName: job.fileName,
    });

    if (data.status === 'completed') {
      const document = data.documents?.[0];
      if (!document || typeof document.text !== 'string' || !document.text.trim()) {
        throw new Error('We could not read any lesson text from ' + job.fileName + '. Try a clearer file.');
      }
      return document;
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      throw new Error(data.error_message || 'We could not process ' + job.fileName + '. Please try again.');
    }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error('Document processing is taking longer than expected. The job is saved on the server. Return later and try again.');
}

export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractTextFromFiles([file]);
  return result.text;
}

export async function extractTextFromFiles(
  files: File[],
  options?: { onProgress?: (progress: LessonExtractionProgress) => void },
): Promise<LessonExtractionClientResult> {
  if (!files?.length) throw new Error('No files selected for text extraction.');
  if (files.length > MAX_FILES) throw new Error('Maximum 5 files allowed per upload.');

  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);

  const response = await fetch('/api/backend/ai/lesson-extraction/jobs', {
    method: 'POST',
    body: form,
    cache: 'no-store',
  });
  const data = await readJson(response) as { jobs?: Array<{ id: string; fileName: string }> };
  if (!Array.isArray(data.jobs) || data.jobs.length !== files.length) {
    throw new Error('The server did not accept all lesson files. Please retry the upload.');
  }

  const documents: Array<{ name: string; text: string }> = [];
  for (const [index, job] of data.jobs.entries()) {
    if (!job || typeof job.id !== 'string' || typeof job.fileName !== 'string') {
      throw new Error('The server returned an invalid document processing job.');
    }
    const result = await waitForJob(job, index + 1, files.length, options?.onProgress);
    documents.push({ name: result.name || job.fileName, text: result.text });
  }

  const charCount = documents.reduce((total, document) => total + document.text.length, 0);
  if (charCount > MAX_CHARACTERS) {
    throw new Error('These documents contain more than 900,000 readable characters. Split them into smaller chapter groups.');
  }
  const text = documents.map((document) => '--- ' + document.name + ' ---\\n' + document.text).join('\\n\\n');
  return {
    text,
    documents,
    charCount,
    filesProcessed: documents.length,
    truncated: false,
  };
}
