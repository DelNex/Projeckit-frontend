import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTextFromFiles } from '../lesson-parser';
import { getLocalDocumentCapacity, LOCAL_DOCUMENT_MAX_CHARACTERS } from '../local-document-engine';

function mockStorage() {
  const uploaded: string[] = [];
  return {
    uploaded,
    adapter: {
      getUserId: async () => 'teacher-1',
      upload: async (storagePath: string) => { uploaded.push(storagePath); },
      remove: async (paths: string[]) => { for (const path of paths) { const index = uploaded.indexOf(path); if (index >= 0) uploaded.splice(index, 1); } },
    },
  };
}

function mockExtraction(texts: string[]) {
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/lesson-extraction/jobs')) {
      return Response.json({ jobs: texts.map((_, i) => ({ id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), fileName: 'lesson-' + (i + 1) + '.txt' })) });
    }
    const text = texts[index++];
    return Response.json({
      id: 'job-' + index,
      status: 'completed',
      progress: { stage: 'completed', percent: 100, label: 'Lesson document is ready' },
      documents: [{ name: 'lesson-' + index + '.txt', text }],
    });
  }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}

test('lesson text is returned from the server extraction job', async () => {
  const restore = mockExtraction(['Chapter 1\n\nLearning objectives\nUnderstand the topic.']);
  const storage = mockStorage();
  try {
    const file = new File(['ignored browser bytes'], 'lesson.txt', { type: 'text/plain' });
    const result = await extractTextFromFiles([file], { storageAdapter: storage.adapter });
    assert.equal(result.filesProcessed, 1);
    assert.equal(result.documents[0].name, 'lesson-1.txt');
    assert.match(result.text, /Learning objectives/);
    assert.equal(result.truncated, false);
  } finally { restore(); }
});

test('multiple server jobs preserve document boundaries', async () => {
  const restore = mockExtraction(['First chapter', 'Second chapter']);
  const storage = mockStorage();
  try {
    const files = [new File(['one'], 'chapter-1.txt'), new File(['two'], 'chapter-2.md')];
    const result = await extractTextFromFiles(files, { storageAdapter: storage.adapter });
    assert.equal(result.documents.length, 2);
    assert.match(result.text, /--- lesson-1.txt ---/);
    assert.match(result.text, /--- lesson-2.txt ---/);
  } finally { restore(); }
});

test('server upload capacity is limited to 20 MB per file', async () => {
  const capacity = await getLocalDocumentCapacity();
  assert.equal(capacity.maxFileMb, 20);
  assert.equal(capacity.deviceClass, 'standard');
});

test('extraction rejects oversized AI context instead of silently truncating it', async () => {
  const restore = mockExtraction(['x'.repeat(LOCAL_DOCUMENT_MAX_CHARACTERS + 1)]);
  const storage = mockStorage();
  try {
    const file = new File(['ignored'], 'large.txt');
    await assert.rejects(() => extractTextFromFiles([file], { storageAdapter: storage.adapter }), /900,000 readable characters/);
  } finally { restore(); }
});

test('more than five source files are rejected before upload', async () => {
  const files = Array.from({ length: 6 }, (_, index) => new File(['lesson'], `lesson-${index}.txt`));
  await assert.rejects(() => extractTextFromFiles(files), /Maximum 5 files/);
});
