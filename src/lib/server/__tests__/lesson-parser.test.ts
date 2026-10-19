/**
 * Project KIT — Server-Side Lesson Text Extraction Unit Tests
 * Validates extraction from real compressed DOCX, compressed PDF, 3-slide PPTX, TXT,
 * scanned-image rejection, garbage detection, file limits, and long-text preservation.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  extractLessonFiles,
  extractTextFromBuffer,
  countReadableChars,
  isGarbageText,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_COUNT,
  MIN_READABLE_CHARS,
} from '../lesson-parser';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('Project KIT — Server-Side Lesson Text Extractor Tests', () => {
  it('1. extracts clean text from a UTF-8 text file (.txt)', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_lesson.txt'));
    const result = await extractLessonFiles([{ name: 'sample_lesson.txt', buffer: buf }]);

    assert.ok(result.text.includes('Photosynthesis is a biological process'));
    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.truncated, false);
    assert.ok(result.charCount >= MIN_READABLE_CHARS);
  });

  it('2. extracts clean text from a compressed DOCX file (.docx)', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'compressed_lesson.docx'));
    const result = await extractLessonFiles([{ name: 'compressed_lesson.docx', buffer: buf }]);

    assert.ok(result.text.includes('Photosynthesis is a biological process'));
    assert.strictEqual(result.filesProcessed, 1);
    assert.strictEqual(result.truncated, false);
    assert.ok(result.charCount >= MIN_READABLE_CHARS);
  });

  it('3. extracts text from a 3-slide PPTX in slide order (.pptx)', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'three_slides.pptx'));
    const result = await extractLessonFiles([{ name: 'three_slides.pptx', buffer: buf }]);

    assert.ok(result.text.includes('Slide 1: Introduction to Cellular Respiration'));
    assert.ok(result.text.includes('Slide 2: The Tricarboxylic Acid Cycle'));
    assert.ok(result.text.includes('Slide 3: Oxidative Phosphorylation'));

    // Check slide order: Slide 1 comes before Slide 2, and Slide 2 comes before Slide 3
    const idx1 = result.text.indexOf('Slide 1');
    const idx2 = result.text.indexOf('Slide 2');
    const idx3 = result.text.indexOf('Slide 3');
    assert.ok(idx1 !== -1 && idx2 !== -1 && idx3 !== -1);
    assert.ok(idx1 < idx2 && idx2 < idx3, 'Slides must be extracted in chronological slide order');
    assert.strictEqual(result.filesProcessed, 1);
  });

  it('4. extracts text from a real compressed PDF file (.pdf)', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'compressed_lesson.pdf'));
    const result = await extractLessonFiles([{ name: 'compressed_lesson.pdf', buffer: buf }]);

    assert.ok(result.text.length >= MIN_READABLE_CHARS);
    assert.strictEqual(result.filesProcessed, 1);
  });

  it('5. rejects scanned-image PDF with fewer than 300 readable characters', async () => {
    const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'scanned_image.pdf'));

    await assert.rejects(
      async () => {
        await extractLessonFiles([{ name: 'scanned_image.pdf', buffer: buf }]);
      },
      (err: any) => {
        assert.ok(
          err.message.includes('This file has no readable text. Upload a text-based PDF, DOCX or PPTX.'),
          `Unexpected error message: ${err.message}`
        );
        return true;
      }
    );
  });

  it('6. detects and rejects garbage binary / corrupted files', async () => {
    // Generate binary garbage with low letter ratio
    const garbageBuffer = Buffer.from(
      Array.from({ length: 500 }, (_, i) => (i % 256) ^ 0xaa)
    );

    await assert.rejects(
      async () => {
        await extractLessonFiles([{ name: 'corrupted.txt', buffer: garbageBuffer }]);
      },
      (err: any) => {
        assert.ok(
          err.message.includes('The document appears to contain corrupted or unreadable text') ||
          err.message.includes('This file has no readable text'),
          `Unexpected error message: ${err.message}`
        );
        return true;
      }
    );
  });

  it('7. enforces the configured per-file limit with a school-specific message', async () => {
    const oversizedBuffer = Buffer.alloc(61 * 1024 * 1024); // 61 MB

    await assert.rejects(
      async () => {
        await extractLessonFiles([
          { name: 'huge_document.txt', buffer: oversizedBuffer, size: oversizedBuffer.length },
        ]);
      },
      /This file is 61 MB\. The limit for your school is 60 MB\./
    );
  });

  it('8. enforces max 5 files limit', async () => {
    const validBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_lesson.txt'));
    const sixFiles = [
      { name: 'file1.txt', buffer: validBuf },
      { name: 'file2.txt', buffer: validBuf },
      { name: 'file3.txt', buffer: validBuf },
      { name: 'file4.txt', buffer: validBuf },
      { name: 'file5.txt', buffer: validBuf },
      { name: 'file6.txt', buffer: validBuf },
    ];

    await assert.rejects(
      async () => {
        await extractLessonFiles(sixFiles);
      },
      /Maximum 5 files allowed per upload/
    );
  });

  it('9. preserves long extracted text and its source document without truncating it', async () => {
    const pdfBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'compressed_lesson.pdf'));
    const result = await extractLessonFiles([{ name: 'large_document.pdf', buffer: pdfBuf }]);

    assert.ok(result.documents[0].text.length > 40000);
    assert.ok(result.text.includes(result.documents[0].text));
    assert.strictEqual(result.documents[0].name, 'large_document.pdf');
    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.notice, undefined);
  });
});
