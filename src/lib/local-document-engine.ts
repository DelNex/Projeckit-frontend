/**
 * Project KIT local-first document engine.
 *
 * Original files stay in this browser. They are never sent to Supabase Storage.
 * Extracted text is passed to the authenticated exam-generation API only.
 */
const DATABASE_NAME = 'projectkit-local-documents';
const DATABASE_VERSION = 1;
const STORE_NAME = 'documents';
const MAX_EXTRACTED_CHARACTERS = 900_000;
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

type ExtractionResponse = { id: string; text?: string; error?: string };
let extractionWorker: Worker | null = null;
const pendingExtractions = new Map<string, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function getExtractionWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('This browser does not support background document processing. Use a modern browser to extract lesson files.');
  }
  if (extractionWorker) return extractionWorker;

  const worker = new Worker(new URL('./local-document.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<ExtractionResponse>) => {
    const pending = pendingExtractions.get(event.data.id);
    if (!pending) return;
    pendingExtractions.delete(event.data.id);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.text || '');
  };
  const failWorker = () => {
    for (const pending of pendingExtractions.values()) pending.reject(new Error('Background document processing stopped unexpectedly. Please retry.'));
    pendingExtractions.clear();
    worker.terminate();
    if (extractionWorker === worker) extractionWorker = null;
  };
  worker.onerror = failWorker;
  worker.onmessageerror = failWorker;
  extractionWorker = worker;
  return worker;
}

function extractInWorker(file: File): Promise<string> {
  if (typeof Worker === 'undefined') {
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension === 'txt' || extension === 'md') return file.text();
    return Promise.reject(new Error('This browser does not support background document processing. Use a modern browser to extract PDF, DOCX, and PPTX files.'));
  }

  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    pendingExtractions.set(id, { resolve, reject });
    try {
      getExtractionWorker().postMessage({ id, file });
    } catch (error) {
      pendingExtractions.delete(id);
      reject(error instanceof Error ? error : new Error('Could not start background document processing.'));
    }
  });
}

function assertTextLimit(text: string, fileName: string): string {
  const normalized = text.trim();
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new Error(
      `'${fileName}' contains more than 900,000 readable characters. Split the document by chapter and generate smaller exams so no source content is silently discarded.`
    );
  }
  return normalized;
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
    const text = assertTextLimit(await extractInWorker(file), file.name);
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
