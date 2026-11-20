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

export type LocalDocumentProgress = { stage: 'extracting' | 'ocr'; progress: number; message: string; pageNumber?: number; pageCount?: number };

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
  // The server, not the phone, performs document extraction and OCR.
  const maxFileBytes = 20 * 1024 * 1024;
  return {
    maxFileBytes,
    maxFileMb: 20,
    deviceClass: 'standard',
    availableBytes: null,
  };
}

