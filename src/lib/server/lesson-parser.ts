/**
 * Project KIT — Server-Side Lesson Text Extractor
 * Robust text extraction for PDF, DOCX, PPTX, and TXT/MD files.
 *
 * Enforces:
 * - Max 10 MB per file
 * - Max 5 files
 * - Max 500,000 characters total after cleaning
 * - Minimum 300 readable characters per document
 * - Garbage and corrupted text rejection
 */

import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import * as mammoth from 'mammoth';
import JSZip from 'jszip';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_COUNT = 5;
export const MAX_TOTAL_CHARS = 500000;
export const MIN_READABLE_CHARS = 300;

export interface LessonFileInput {
  name: string;
  buffer: Buffer;
  size?: number;
}

export interface ExtractedLessonResult {
  text: string;
  documents: Array<{ name: string; text: string }>;
  charCount: number;
  filesProcessed: number;
  truncated: boolean;
  notice?: string;
}

/**
 * Counts readable alphanumeric characters (letters and numbers in any language).
 */
export function countReadableChars(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches ? matches.length : 0;
}

/**
 * Detects whether extracted text is garbage (corrupted binary, non-printable noise).
 */
export function isGarbageText(text: string): boolean {
  if (text.length < 50) return false;

  // 1. Ratio of letters, numbers and whitespace to total length
  const validChars = text.match(/[\p{L}\p{N}\s\p{P}]/gu) || [];
  const validRatio = validChars.length / text.length;
  if (validRatio < 0.65) {
    return true;
  }

  // 2. High concentration of binary control characters or replacement characters
  const badChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g) || [];
  if (badChars.length / text.length > 0.03) {
    return true;
  }

  // 3. Ratio of letters and spaces specifically
  const lettersAndSpaces = text.match(/[\p{L}\s]/gu) || [];
  if (lettersAndSpaces.length / text.length < 0.50) {
    return true;
  }

  return false;
}

/**
 * Cleans extracted lesson text: normalizes spaces, trims excessive blank lines.
 */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts text from a single file buffer according to its format.
 */
export async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const lowerName = filename.toLowerCase();

  // 1. Plain Text or Markdown
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    const raw = buffer.toString('utf-8');
    return cleanExtractedText(raw);
  }

  // 2. DOCX (Word Document)
  if (lowerName.endsWith('.docx')) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const raw = result.value || '';
      return cleanExtractedText(raw);
    } catch (err: any) {
      throw new Error(`Failed to parse DOCX file '${filename}': ${err.message || 'Invalid or corrupted Word document'}`);
    }
  }

  // 3. PPTX (PowerPoint Presentation)
  if (lowerName.endsWith('.pptx')) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const textParts: string[] = [];

      // Collect slides in numerical order: slide1.xml, slide2.xml, ...
      const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
        return numA - numB;
      });

      for (const slidePath of slideFiles) {
        const xml = await zip.files[slidePath].async('string');
        const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
        const slideText = matches
          .map((m) => m.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');
        if (slideText) {
          textParts.push(slideText);
        }
      }

      // Collect slide notes in numerical order
      const notesFiles = Object.keys(zip.files).filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p));
      notesFiles.sort((a, b) => {
        const numA = parseInt(a.match(/notesSlide(\d+)\.xml/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/notesSlide(\d+)\.xml/)?.[1] || '0', 10);
        return numA - numB;
      });

      for (const notePath of notesFiles) {
        const xml = await zip.files[notePath].async('string');
        const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
        const noteText = matches
          .map((m) => m.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');
        if (noteText) {
          textParts.push(`Notes: ${noteText}`);
        }
      }

      const combined = textParts.join('\n\n');
      return cleanExtractedText(combined);
    } catch (err: any) {
      throw new Error(`Failed to parse PPTX file '${filename}': ${err.message || 'Invalid or corrupted PowerPoint document'}`);
    }
  }

  // 4. PDF (Portable Document Format)
  if (lowerName.endsWith('.pdf')) {
    try {
      const data = await pdfParse(buffer);
      const raw = data.text || '';
      return cleanExtractedText(raw);
    } catch (err: any) {
      throw new Error(`Failed to parse PDF file '${filename}': ${err.message || 'Invalid or corrupted PDF document'}`);
    }
  }

  throw new Error(`Unsupported file format for '${filename}'. Please upload PDF, DOCX, PPTX, or TXT.`);
}

/**
 * Extracts and validates lesson text from one or more uploaded files with strict limits.
 */
export async function extractLessonFiles(files: LessonFileInput[]): Promise<ExtractedLessonResult> {
  if (!files || files.length === 0) {
    throw new Error('No files provided for text extraction.');
  }

  if (files.length > MAX_FILES_COUNT) {
    throw new Error(`Maximum ${MAX_FILES_COUNT} files allowed per upload.`);
  }

  const documents: Array<{ name: string; text: string }> = [];

  for (const file of files) {
    const size = file.size ?? file.buffer.length;
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File '${file.name}' exceeds the 10 MB maximum limit.`);
    }

    const text = await extractTextFromBuffer(file.buffer, file.name);

    // Validate minimum readable character count (e.g. catches scanned PDFs with no OCR)
    const readableChars = countReadableChars(text);
    if (readableChars < MIN_READABLE_CHARS) {
      throw new Error(
        `This file has no readable text. Upload a text-based PDF, DOCX or PPTX.`
      );
    }

    // Validate against corrupt / binary garbage
    if (isGarbageText(text)) {
      throw new Error(
        `The document appears to contain corrupted or unreadable text. Upload a text-based PDF, DOCX or PPTX.`
      );
    }

    documents.push({ name: file.name, text });
  }

  const totalDocumentChars = documents.reduce((total, document) => total + document.text.length, 0);
  if (totalDocumentChars > MAX_TOTAL_CHARS) {
    throw new Error(`These documents contain more than ${MAX_TOTAL_CHARS.toLocaleString()} characters. Split them into smaller uploads so no lesson content is dropped.`);
  }
  const combinedText = documents.map((document) => `--- ${document.name} ---\n${document.text}`).join('\n\n');

  return {
    text: combinedText,
    documents,
    charCount: combinedText.length,
    filesProcessed: files.length,
    truncated: false,
  };
}
