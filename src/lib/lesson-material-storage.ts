'use client';

import { createClient } from '@/lib/supabase/client';

export type StoredLessonMaterial = { name: string; text: string };
export type StoredLessonMaterials = Record<string, StoredLessonMaterial[]>;

type MaterialRecord = {
  key: string;
  userId: string;
  tosId: string;
  updatedAt: number;
  materials: StoredLessonMaterials;
};

const DATABASE_NAME = 'projectkit-teacher-workspace';
const STORE_NAME = 'lesson-materials';
const DATABASE_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Browser storage is unavailable.'));
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
  });
}

async function currentUserId(): Promise<string | null> {
  const { data: { user }, error } = await createClient().auth.getUser();
  return error || !user ? null : user.id;
}

function recordKey(userId: string, tosId: string) { return `${userId}:${tosId}`; }

export async function saveLessonMaterials(tosId: string, materials: StoredLessonMaterials): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        key: recordKey(userId, tosId), userId, tosId, updatedAt: Date.now(), materials,
      } satisfies MaterialRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save lesson materials.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving lesson materials was interrupted.'));
    });
    return true;
  } finally { database.close(); }
}

export async function loadLessonMaterials(tosId: string): Promise<StoredLessonMaterials | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const database = await openDatabase();
  try {
    const record = await new Promise<MaterialRecord | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(recordKey(userId, tosId));
      request.onsuccess = () => resolve(request.result as MaterialRecord | undefined);
      request.onerror = () => reject(request.error || new Error('Could not load saved lesson materials.'));
    });
    if (!record || record.userId !== userId || record.tosId !== tosId) return null;
    if (Date.now() - record.updatedAt > MAX_AGE_MS) {
      await clearLessonMaterials(tosId);
      return null;
    }
    return record.materials && typeof record.materials === 'object' ? record.materials : null;
  } finally { database.close(); }
}

export async function clearLessonMaterials(tosId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(recordKey(userId, tosId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clear saved lesson materials.'));
    });
  } finally { database.close(); }
}
