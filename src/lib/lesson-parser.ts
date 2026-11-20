/**
 * Project KIT — Server-side lesson document extraction.
 *
 * The browser uploads original files and checks job progress.
 * PDF parsing, image OCR, and document extraction run on the backend.
 * The backend job continues if the teacher closes this page.
 */

import { createClient } from '@/lib/supabase/client';

const LESSON_UPLOAD_BUCKET = 'lesson-uploads';
const ALLOWED_FILE_EXTENSIONS = new Set(['pdf','docx','pptx','txt','md','png','jpg','jpeg','webp','bmp','tif','tiff']);

export interface LessonExtractionClientResult {
  text: string;
  documents: Array<{ name: string; text: string; lowConfidencePages?: number[] }>;
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

export interface LessonStorageAdapter {
  getUserId(): Promise<string | null>;
  upload(storagePath: string, file: File): Promise<void>;
  remove(storagePaths: string[]): Promise<void>;
}

type PendingExtractionRecord = {
  tosId: string;
  contextId: string;
  jobs: Array<{ id: string; fileName: string }>;
  teacherInstructions?: string;
  createdAt: number;
};

const MAX_FILES = 5;
const MAX_CHARACTERS = 900_000;
const POLL_INTERVAL_MS = 2500;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const PENDING_JOB_KEY_PREFIX = 'projectkit:lesson-ocr:';

function pendingKey(tosId: string, contextId = 'exam-generator') {
  return PENDING_JOB_KEY_PREFIX + tosId + ':' + contextId;
}

function readPending(tosId: string, contextId = 'exam-generator'): PendingExtractionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(pendingKey(tosId, contextId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingExtractionRecord;
    if (value.tosId !== tosId || value.contextId !== contextId || !Array.isArray(value.jobs) || Date.now() - value.createdAt > 24 * 60 * 60 * 1000) {
      window.localStorage.removeItem(pendingKey(tosId, contextId));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function clearPendingLessonExtraction(tosId: string, contextId = 'exam-generator') {
  if (typeof window !== 'undefined') window.localStorage.removeItem(pendingKey(tosId, contextId));
}

async function createSupabaseStorageAdapter(): Promise<LessonStorageAdapter> {
  const supabase = createClient();
  return {
    getUserId: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;
      return user.id;
    },
    upload: async (storagePath, file) => {
      const { error } = await supabase.storage.from(LESSON_UPLOAD_BUCKET).upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream', cacheControl: '3600', upsert: false,
      });
      if (error) throw new Error(error.message || 'Could not upload ' + file.name + '. Check your connection and retry.');
    },
    remove: async (storagePaths) => {
      if (storagePaths.length) await supabase.storage.from(LESSON_UPLOAD_BUCKET).remove(storagePaths);
    },
  };
}

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

function buildResult(documents: Array<{ name: string; text: string; lowConfidencePages?: number[] }>): LessonExtractionClientResult {
  const charCount = documents.reduce((total, document) => total + document.text.length, 0);
  if (charCount > MAX_CHARACTERS) {
    throw new Error('These documents contain more than 900,000 readable characters. Split them into smaller chapter groups.');
  }
  const lowConfidence = documents.filter((document) => (document.lowConfidencePages || []).length > 0);
  const notice = lowConfidence.length
    ? 'OCR completed, but some pages may need teacher review: ' +
      lowConfidence.map((document) => document.name + ' (page(s) ' + document.lowConfidencePages!.join(', ') + ')').join('; ') +
      '. Check these pages against the original before generating an exam.'
    : undefined;
  return {
    text: documents.map((document) => '--- ' + document.name + ' ---\\n' + document.text).join('\\n\\n'),
    documents,
    charCount,
    filesProcessed: documents.length,
    truncated: false,
    ...(notice ? { notice } : {}),
  };
}

export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractTextFromFiles([file]);
  return result.text;
}

export async function extractTextFromFiles(
  files: File[],
  options?: {
    onProgress?: (progress: LessonExtractionProgress) => void;
    tosId?: string;
    contextId?: string;
    teacherInstructions?: string;
    storageAdapter?: LessonStorageAdapter;
  },
): Promise<LessonExtractionClientResult> {
  if (!files?.length) throw new Error('No files selected for text extraction.');
  if (files.length > MAX_FILES) throw new Error('Maximum 5 files allowed per upload.');
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("'" + file.name + "' is larger than the 20 MB per-file upload limit.");
    }
  }

  const storage = options?.storageAdapter || await createSupabaseStorageAdapter();
  const userId = await storage.getUserId();
  if (!userId) throw new Error('Your session expired. Sign in again before uploading lesson files.');

  const uploaded: Array<{ storagePath: string; fileName: string; mimeType: string; size: number }> = [];
  let jobsRequestStarted = false;
  try {
    for (const file of files) {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
        throw new Error("'" + file.name + "' is not a supported lesson file.");
      }
      const storagePath = userId + '/ocr-source/' + crypto.randomUUID() + '.' + extension;
      await storage.upload(storagePath, file);
      uploaded.push({
        storagePath,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    jobsRequestStarted = true;
    const response = await fetch('/api/backend/ai/lesson-extraction/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: uploaded }),
      cache: 'no-store',
    });
    const data = await readJson(response) as { jobs?: Array<{ id: string; fileName: string }> };
    if (!Array.isArray(data.jobs) || data.jobs.length !== files.length) {
      throw new Error('The server did not accept all lesson files. Please retry the upload.');
    }
    for (const job of data.jobs) {
      if (!job || typeof job.id !== 'string' || typeof job.fileName !== 'string') {
        throw new Error('The server returned an invalid document processing job.');
      }
    }

    if (options?.tosId && typeof window !== 'undefined') {
      window.localStorage.setItem(pendingKey(options.tosId, options.contextId), JSON.stringify({
        tosId: options.tosId,
        contextId: options.contextId || 'exam-generator',
        jobs: data.jobs,
        teacherInstructions: options.teacherInstructions,
        createdAt: Date.now(),
      } satisfies PendingExtractionRecord));
    }

    const documents: Array<{ name: string; text: string; lowConfidencePages?: number[] }> = [];
    for (const [index, job] of data.jobs.entries()) {
      const result = await waitForJob(job, index + 1, files.length, options?.onProgress);
      documents.push({ name: result.name || job.fileName, text: result.text, lowConfidencePages: result.lowConfidencePages });
    }
    return buildResult(documents);
  } catch (error) {
    if (uploaded.length && !jobsRequestStarted) await storage.remove(uploaded.map((file) => file.storagePath)).catch(() => undefined);
    throw error;
  }
}

export async function resumePendingLessonExtraction(
  tosId: string,
  onProgress?: (progress: LessonExtractionProgress) => void,
  contextId = 'exam-generator',
): Promise<(LessonExtractionClientResult & { teacherInstructions?: string }) | null> {
  const pending = readPending(tosId, contextId);
  if (!pending) return null;
  const documents: Array<{ name: string; text: string }> = [];
  for (const [index, job] of pending.jobs.entries()) {
    const result = await waitForJob(job, index + 1, pending.jobs.length, onProgress);
    documents.push({ name: result.name || job.fileName, text: result.text, lowConfidencePages: result.lowConfidencePages });
  }
  return { ...buildResult(documents), teacherInstructions: pending.teacherInstructions };
}
