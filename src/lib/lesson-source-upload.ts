'use client';

import { createClient } from '@/lib/supabase/client';
import {
  LESSON_SOURCE_BUCKET,
  MAX_COMPRESSED_LESSON_SOURCE_BYTES,
  MAX_LESSON_SOURCE_CHARACTERS,
  MAX_LESSON_SOURCE_DOCUMENTS,
  type LessonSourceDocument,
  type LessonSourceManifest,
  isLessonSourceManifest,
} from '@/lib/lesson-source';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Upload only extracted lesson text. Original files remain in this browser. */
export async function uploadCompressedLessonDocuments(documents: LessonSourceDocument[]): Promise<LessonSourceManifest> {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > MAX_LESSON_SOURCE_DOCUMENTS) {
    throw new Error('Choose between 1 and ' + MAX_LESSON_SOURCE_DOCUMENTS + ' lesson documents.');
  }

  const safeDocuments = documents.map((document) => {
    if (!document || typeof document.name !== 'string' || typeof document.text !== 'string' || !document.text.trim()) {
      throw new Error('A lesson document is empty or invalid. Extract the files again before generating an exam.');
    }
    if (document.competencyId !== undefined && typeof document.competencyId !== 'string') {
      throw new Error('A lesson document contains an invalid competency reference.');
    }
    return {
      name: document.name.slice(0, 240),
      text: document.text,
      ...(document.competencyId ? { competencyId: document.competencyId } : {}),
    };
  });

  const charCount = safeDocuments.reduce((total, document) => total + document.text.length, 0);
  if (charCount > MAX_LESSON_SOURCE_CHARACTERS) {
    throw new Error('Lesson materials exceed ' + MAX_LESSON_SOURCE_CHARACTERS.toLocaleString() + ' characters. Split the source into smaller chapter groups.');
  }
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser does not support local gzip compression. Update the browser to upload lesson text securely.');
  }

  const serialized = JSON.stringify({ version: 1, documents: safeDocuments });
  const sourceBlob = new Blob([serialized], { type: 'application/json' });
  const compressedBlob = await new Response(
    sourceBlob.stream().pipeThrough(new CompressionStream('gzip'))
  ).blob();

  if (compressedBlob.size > MAX_COMPRESSED_LESSON_SOURCE_BYTES) {
    throw new Error('The compressed lesson source is still too large. Split the material into smaller chapter groups.');
  }

  const compressedBytes = new Uint8Array(await compressedBlob.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', compressedBytes);
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Your session expired. Sign in again before uploading lesson text.');

  const storagePath = user.id + '/lesson-imports/' + crypto.randomUUID() + '.json.gz';
  const manifest: LessonSourceManifest = {
    version: 1,
    storagePath,
    sha256: toHex(new Uint8Array(digest)),
    compressedBytes: compressedBlob.size,
    uncompressedBytes: sourceBlob.size,
    charCount,
    documentCount: safeDocuments.length,
    uploadedAt: new Date().toISOString(),
  };

  const { error: uploadError } = await supabase.storage.from(LESSON_SOURCE_BUCKET).upload(storagePath, compressedBlob, {
    contentType: 'application/gzip',
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message || 'Could not upload the compressed lesson text. Check your connection and retry.');
  return manifest;
}

export async function removeCompressedLessonSourceFromBrowser(manifest: LessonSourceManifest): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isLessonSourceManifest(manifest, user.id)) return;
    await supabase.storage.from(LESSON_SOURCE_BUCKET).remove([manifest.storagePath]);
  } catch {
    // Server-side cleanup is also performed after the job finishes.
  }
}
