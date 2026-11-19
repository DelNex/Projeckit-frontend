import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  LESSON_SOURCE_BUCKET,
  MAX_LESSON_SOURCE_CHARACTERS,
  MAX_LESSON_SOURCE_DOCUMENTS,
  MAX_UNCOMPRESSED_LESSON_SOURCE_BYTES,
  isLessonSourceManifest,
  type LessonSourceDocument,
  type LessonSourceManifest,
} from '@/lib/lesson-source';

export async function readCompressedLessonDocuments(
  admin: any,
  manifest: LessonSourceManifest,
  ownerId: string
): Promise<LessonSourceDocument[]> {
  if (!isLessonSourceManifest(manifest, ownerId)) {
    throw new Error('The uploaded lesson source reference is invalid or belongs to another user.');
  }

  const { data, error } = await admin.storage.from(LESSON_SOURCE_BUCKET).download(manifest.storagePath);
  if (error || !data) throw new Error('The compressed lesson source could not be read from private storage.');

  const compressed = Buffer.from(await data.arrayBuffer());
  if (compressed.length !== manifest.compressedBytes) throw new Error('The uploaded lesson source size does not match its manifest.');

  const digest = createHash('sha256').update(compressed).digest('hex');
  if (digest !== manifest.sha256.toLowerCase()) {
    throw new Error('The uploaded lesson source failed its integrity check. Upload the lesson materials again.');
  }

  let decoded: Buffer;
  try {
    decoded = gunzipSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_LESSON_SOURCE_BYTES });
  } catch {
    throw new Error('The uploaded lesson source is not a valid or safe gzip document.');
  }
  if (decoded.length !== manifest.uncompressedBytes) throw new Error('The decompressed lesson source size does not match its manifest.');

  let payload: unknown;
  try {
    payload = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new Error('The compressed lesson source contains invalid JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The compressed lesson source has an invalid document structure.');
  }

  const source = payload as { version?: unknown; documents?: unknown };
  if (source.version !== 1 || !Array.isArray(source.documents)
    || source.documents.length !== manifest.documentCount
    || source.documents.length < 1
    || source.documents.length > MAX_LESSON_SOURCE_DOCUMENTS) {
    throw new Error('The compressed lesson source document list is invalid.');
  }

  const documents: LessonSourceDocument[] = [];
  let charCount = 0;
  for (const item of source.documents) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('The compressed lesson source contains an invalid document.');
    const document = item as Record<string, unknown>;
    if (typeof document.name !== 'string' || document.name.length > 240
      || typeof document.text !== 'string' || !document.text.trim()
      || (document.competencyId !== undefined && typeof document.competencyId !== 'string')) {
      throw new Error('The compressed lesson source contains invalid document text or metadata.');
    }
    charCount += document.text.length;
    if (charCount > MAX_LESSON_SOURCE_CHARACTERS) throw new Error('The compressed lesson source exceeds the configured character limit.');
    documents.push({
      name: document.name,
      text: document.text,
      ...(typeof document.competencyId === 'string' ? { competencyId: document.competencyId } : {}),
    });
  }

  if (charCount !== manifest.charCount) throw new Error('The lesson source character count does not match its manifest.');
  return documents;
}

export async function deleteCompressedLessonSource(admin: any, manifest: unknown, ownerId: string): Promise<void> {
  if (!isLessonSourceManifest(manifest, ownerId)) return;
  const { error } = await admin.storage.from(LESSON_SOURCE_BUCKET).remove([manifest.storagePath]);
  if (error) throw error;
}
