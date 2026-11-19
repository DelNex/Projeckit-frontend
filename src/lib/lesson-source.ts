export const LESSON_SOURCE_BUCKET = 'lesson-uploads';
export const MAX_LESSON_SOURCE_CHARACTERS = 900_000;
export const MAX_LESSON_SOURCE_DOCUMENTS = 5;
export const MAX_COMPRESSED_LESSON_SOURCE_BYTES = 6 * 1024 * 1024;
export const MAX_UNCOMPRESSED_LESSON_SOURCE_BYTES = 8 * 1024 * 1024;

export interface LessonSourceManifest {
  version: 1;
  storagePath: string;
  sha256: string;
  compressedBytes: number;
  uncompressedBytes: number;
  charCount: number;
  documentCount: number;
  uploadedAt: string;
}

export interface LessonSourceDocument {
  name: string;
  text: string;
  competencyId?: string;
}

export function isLessonSourceManifest(value: unknown, ownerId: string): value is LessonSourceManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ownerId) return false;
  const manifest = value as Record<string, unknown>;
  const storagePath = manifest.storagePath;
  const uploadedAt = manifest.uploadedAt;

  return manifest.version === 1
    && typeof storagePath === 'string'
    && storagePath.length <= 240
    && storagePath.startsWith(ownerId + '/lesson-imports/')
    && storagePath.endsWith('.json.gz')
    && !storagePath.includes('..')
    && !storagePath.startsWith('/')
    && typeof manifest.sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(manifest.sha256)
    && Number.isInteger(manifest.compressedBytes)
    && Number(manifest.compressedBytes) > 0
    && Number(manifest.compressedBytes) <= MAX_COMPRESSED_LESSON_SOURCE_BYTES
    && Number.isInteger(manifest.uncompressedBytes)
    && Number(manifest.uncompressedBytes) > 0
    && Number(manifest.uncompressedBytes) <= MAX_UNCOMPRESSED_LESSON_SOURCE_BYTES
    && Number.isInteger(manifest.charCount)
    && Number(manifest.charCount) > 0
    && Number(manifest.charCount) <= MAX_LESSON_SOURCE_CHARACTERS
    && Number.isInteger(manifest.documentCount)
    && Number(manifest.documentCount) > 0
    && Number(manifest.documentCount) <= MAX_LESSON_SOURCE_DOCUMENTS
    && typeof uploadedAt === 'string'
    && Number.isFinite(Date.parse(uploadedAt));
}
