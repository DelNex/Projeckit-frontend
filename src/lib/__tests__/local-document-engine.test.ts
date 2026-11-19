import assert from 'node:assert/strict';
import { test } from 'node:test';
import { File } from 'node:buffer';
import { extractTextFromFiles } from '../lesson-parser';
import { getLocalDocumentCapacity, LOCAL_DOCUMENT_MAX_CHARACTERS } from '../local-document-engine';

test('lesson text files are extracted locally without Supabase upload', async () => {
  const file = new File(['Chapter 1\n\nLearning objectives\nUnderstand the topic.'], 'lesson.txt', { type: 'text/plain' });
  const result = await extractTextFromFiles([file]);

  assert.equal(result.filesProcessed, 1);
  assert.equal(result.documents[0].name, 'lesson.txt');
  assert.match(result.text, /Learning objectives/);
  assert.equal(result.truncated, false);
});

test('multiple local documents preserve document boundaries', async () => {
  const files = [
    new File(['First chapter'], 'chapter-1.txt'),
    new File(['Second chapter'], 'chapter-2.md'),
  ];
  const result = await extractTextFromFiles(files);

  assert.equal(result.documents.length, 2);
  assert.match(result.text, /--- chapter-1.txt ---/);
  assert.match(result.text, /--- chapter-2.md ---/);
});

test('local document capacity has a conservative server-side fallback', async () => {
  const capacity = await getLocalDocumentCapacity();
  assert.equal(capacity.maxFileMb, 100);
  assert.equal(capacity.deviceClass, 'standard');
});

test('extraction rejects oversized AI context instead of silently truncating it', async () => {
  const file = new File(['x'.repeat(LOCAL_DOCUMENT_MAX_CHARACTERS + 1)], 'large.txt');
  await assert.rejects(
    () => extractTextFromFiles([file]),
    /200,000 readable characters/
  );
});

test('more than five source files are rejected', async () => {
  const files = Array.from({ length: 6 }, (_, index) => new File(['lesson'], `lesson-${index}.txt`));
  await assert.rejects(() => extractTextFromFiles(files), /Maximum 5 files/);
});
