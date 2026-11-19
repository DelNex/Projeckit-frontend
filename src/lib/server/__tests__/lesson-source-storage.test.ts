import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { deleteCompressedLessonSource, readCompressedLessonDocuments } from '../lesson-source-storage';
import type { LessonSourceManifest } from '@/lib/lesson-source';

const ownerId = 'user-123';
const documents = [
  { name: 'biology.pdf', text: 'Photosynthesis converts light energy into chemical energy.' },
  { name: 'biology-notes.docx', text: 'Chlorophyll absorbs light in green plants.' },
];

function fixture(overrides: Partial<LessonSourceManifest> = {}) {
  const raw = Buffer.from(JSON.stringify({ version: 1, documents }));
  const compressed = gzipSync(raw);
  const manifest: LessonSourceManifest = {
    version: 1,
    storagePath: ownerId + '/lesson-imports/11111111-1111-4111-8111-111111111111.json.gz',
    sha256: createHash('sha256').update(compressed).digest('hex'),
    compressedBytes: compressed.length,
    uncompressedBytes: raw.length,
    charCount: documents.reduce((sum, document) => sum + document.text.length, 0),
    documentCount: documents.length,
    uploadedAt: new Date('2026-11-19T00:00:00.000Z').toISOString(),
    ...overrides,
  };
  return { compressed, manifest };
}

function mockAdmin(compressed: Buffer) {
  const removed: string[][] = [];
  const admin = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, 'lesson-uploads');
        return {
          async download(path: string) {
            assert.equal(path.startsWith(ownerId + '/lesson-imports/'), true);
            return { data: new Blob([compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)]), error: null };
          },
          async remove(paths: string[]) {
            removed.push(paths);
            return { data: [], error: null };
          },
        };
      },
    },
  };
  return { admin, removed };
}

test('reads and validates compressed lesson text with its checksum and manifest', async () => {
  const { compressed, manifest } = fixture();
  const { admin } = mockAdmin(compressed);
  assert.deepEqual(await readCompressedLessonDocuments(admin, manifest, ownerId), documents);
});

test('rejects a lesson source that belongs to another user', async () => {
  const { compressed, manifest } = fixture();
  const { admin } = mockAdmin(compressed);
  await assert.rejects(readCompressedLessonDocuments(admin, manifest, 'another-user'), /invalid or belongs to another user/i);
});

test('rejects corrupted or replaced compressed bytes before decompression', async () => {
  const { manifest } = fixture();
  const { admin } = mockAdmin(Buffer.from('not the uploaded gzip payload'));
  await assert.rejects(readCompressedLessonDocuments(admin, manifest, ownerId), /size does not match|integrity check/i);
});

test('rejects a manifest whose declared character count was changed', async () => {
  const { compressed, manifest } = fixture({ charCount: 999 });
  const { admin } = mockAdmin(compressed);
  await assert.rejects(readCompressedLessonDocuments(admin, manifest, ownerId), /character count/i);
});

test('deletes only a validated user-owned lesson source path', async () => {
  const { compressed, manifest } = fixture();
  const { admin, removed } = mockAdmin(compressed);
  await deleteCompressedLessonSource(admin, manifest, ownerId);
  assert.deepEqual(removed, [[manifest.storagePath]]);
  await deleteCompressedLessonSource(admin, { ...manifest, storagePath: '../other-user/file.json.gz' }, ownerId);
  assert.equal(removed.length, 1);
});
