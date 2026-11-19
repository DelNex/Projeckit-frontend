/**
 * Project KIT local-first document engine.
 *
 * Original files stay in this browser. They are never sent to Supabase Storage.
 * Extracted text is passed to the authenticated exam-generation API only.
 */
import JSZip from 'jszip';

const DATABASE_NAME = 'projectkit-local-documents';
const DATABASE_VERSION = 1;
const STORE_NAME = 'documents';
const MAX_EXTRACTED_CHARACTERS = 200_000;
const NORMAL_FILE_LIMIT_BYTES = 100 * 1024 * 1024;
const LARGE_FILE_LIMIT_BYTES = 500 * 1024 * 1024;

type StoredDocument = {
  id: string;
  name: string;
  size: number;
  updatedAt: number;
  status: 'processing' | 'extracted' | 'failed';
  source?: File;
  text?: string;
};

export type LocalDocumentCapacity = {
  maxFileBytes: number;
  maxFileMb: number;
  deviceClass: 'standard' | 'large';
  availableBytes: number | null;
};

function openDocumentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local document storage.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local document storage.'));
  });
}

async function saveCheckpoint(record: StoredDocument): Promise<void> {
  const database = await openDocumentDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the local processing checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local processing checkpoint was interrupted.'));
  });
  database.close();
}

async function cleanOldCheckpoints(): Promise<void> {
  try {
    const database = await openDocumentDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as StoredDocument;
        if (Date.now() - record.updatedAt > 24 * 60 * 60 * 1000) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Checkpoint cleanup must never prevent a user from extracting a document.
  }
}

export async function getLocalDocumentCapacity(): Promise<LocalDocumentCapacity> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { maxFileBytes: NORMAL_FILE_LIMIT_BYTES, maxFileMb: 100, deviceClass: 'standard', availableBytes: null };
  }

  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0);
  let availableBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate();
    if (typeof estimate?.quota === 'number') {
      availableBytes = Math.max(0, estimate.quota - (estimate.usage || 0));
    }
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Storage estimates and persistent-storage permission are optional browser APIs.
  }

  const supportsLargeFiles = deviceMemory >= 8 && (availableBytes === null || availableBytes >= 1_500 * 1024 * 1024);
  const deviceLimit = supportsLargeFiles ? LARGE_FILE_LIMIT_BYTES : NORMAL_FILE_LIMIT_BYTES;
  const storageLimit = availableBytes === null ? deviceLimit : Math.floor(availableBytes / 3);
  const maxFileBytes = Math.max(0, Math.min(deviceLimit, storageLimit));
  return {
    maxFileBytes,
    maxFileMb: Math.floor(maxFileBytes / (1024 * 1024)),
    deviceClass: supportsLargeFiles ? 'large' : 'standard',
    availableBytes,
  };
}

function normalizeText(text: string): string {
  const seen = new Set<string>();
  return text
    .replace(/\\u0000/g, '')
    .replace(/\\r\\n?/g, '\\n')
    .split(/\\n\\s*\\n/)
    .map((paragraph) => paragraph.replace(/[\\t ]+/g, ' ').trim())
    .filter((paragraph) => {
      if (!paragraph) return true;
      if (seen.has(paragraph)) return false;
      seen.add(paragraph);
      return true;
    })
    .join('\\n\\n')
    .trim();
}

function assertTextLimit(text: string, fileName: string): string {
  const normalized = normalizeText(text);
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new Error(
      `'${fileName}' contains more than 200,000 readable characters. Split the document by chapter and generate smaller exams so no source content is silently discarded.`
    );
  }
  return normalized;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const pages: string[] = [];
  let characterCount = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: unknown) => {
          if (!item || typeof item !== 'object' || !('str' in item)) return '';
          const value = item as { str?: string; hasEOL?: boolean };
          return `${value.str || ''}${value.hasEOL ? '\n' : ' '}`;
        })
        .join('');
      const section = `[Page ${pageNumber}]\n${pageText.trim()}`;
      characterCount += section.length;
      if (characterCount > MAX_EXTRACTED_CHARACTERS) {
        throw new Error(
          `'${file.name}' exceeds the 200,000-character AI source limit. Split it by chapter before generating an exam.`
        );
      }
      pages.push(section);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const text = pages.join('\n\n').trim();
  if (!text) {
    throw new Error(
      `No selectable text was found in '${file.name}'. It may be a scanned PDF; OCR support is required before this file can be used.`
    );
  }
  return text;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || '';
}

async function extractPptx(file: File): Promise<string> {
  const archive = await JSZip.loadAsync(file);
  const slidePaths = Object.keys(archive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));

  const slides: string[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const xml = await archive.file(path)?.async('text');
    if (!xml) continue;
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const text = Array.from(document.getElementsByTagName('a:t'))
      .map((node) => node.textContent || '')
      .filter(Boolean)
      .join(' ');
    if (text.trim()) slides.push(`[Slide ${index + 1}]\n${text}`);
  }
  return slides.join('\n\n');
}

async function extractFile(file: File): Promise<string> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return extractPdf(file);
  if (extension === 'docx') return extractDocx(file);
  if (extension === 'pptx') return extractPptx(file);
  if (extension === 'txt' || extension === 'md') return file.text();
  throw new Error(`'${file.name}' is not supported. Use PDF, DOCX, PPTX, TXT, or Markdown.`);
}

export async function extractLocalDocument(file: File): Promise<{ name: string; text: string }> {
  const capacity = await getLocalDocumentCapacity();
  if (file.size > capacity.maxFileBytes) {
    throw new Error(
      `'${file.name}' is ${Math.ceil(file.size / (1024 * 1024))} MB. This device can currently process files up to ${capacity.maxFileMb} MB. Try a smaller file or a device with more available memory and storage.`
    );
  }

  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await cleanOldCheckpoints();

  const record: StoredDocument = {
    id,
    name: file.name,
    size: file.size,
    updatedAt: Date.now(),
    status: 'processing',
    source: file,
  };

  try {
    await saveCheckpoint(record);
  } catch {
    // Some browsers block IndexedDB or run out of quota. The selected File
    // remains available in memory, so extraction can continue without a checkpoint.
  }

  try {
    const text = assertTextLimit(await extractFile(file), file.name);
    await saveCheckpoint({
      id,
      name: file.name,
      size: file.size,
      updatedAt: Date.now(),
      status: 'extracted',
      text,
    }).catch(() => undefined);
    return { name: file.name, text };
  } catch (error) {
    await saveCheckpoint({
      id,
      name: file.name,
      size: file.size,
      updatedAt: Date.now(),
      status: 'failed',
    }).catch(() => undefined);
    throw error;
  }
}

export const LOCAL_DOCUMENT_MAX_CHARACTERS = MAX_EXTRACTED_CHARACTERS;
