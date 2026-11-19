/**
 * Project KIT — Local-first lesson text extraction.
 *
 * Files are processed in the browser and checkpointed in IndexedDB. Only
 * extracted lesson text is sent to the authenticated exam-generation API.
 * Original documents are never uploaded to Supabase Storage.
 */
import { extractLocalDocument, LOCAL_DOCUMENT_MAX_CHARACTERS, type LocalDocumentProgress } from '@/lib/local-document-engine';

export interface LessonExtractionClientResult {
  text: string;
  documents: Array<{ name: string; text: string }>;
  charCount: number;
  filesProcessed: number;
  truncated: boolean;
  notice?: string;
}

export type LessonExtractionProgress = LocalDocumentProgress & { fileIndex: number; fileCount: number; fileName: string };

export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractTextFromFiles([file]);
  return result.text;
}

export async function extractTextFromFiles(files: File[], options?: { onProgress?: (progress: LessonExtractionProgress) => void }): Promise<LessonExtractionClientResult> {
  if (!files?.length) throw new Error('No files selected for text extraction.');
  if (files.length > 5) throw new Error('Maximum 5 files allowed per upload.');

  const documents: Array<{ name: string; text: string }> = [];
  let totalCharacters = 0;

  // Sequential extraction avoids loading several large documents into memory at once.
  for (const file of files) {
    const document = await extractLocalDocument(file);
    totalCharacters += document.text.length;
    if (totalCharacters > LOCAL_DOCUMENT_MAX_CHARACTERS) {
      throw new Error(
        'These documents contain more than 900,000 readable characters. Split them into smaller chapter groups so no source content is silently dropped.'
      );
    }
    documents.push({ name: document.name, text: document.text });\n    if (document.lowConfidencePages.length) lowConfidence.push({ name: document.name, pages: document.lowConfidencePages });
  }

  const text = documents
    .map((document) => `--- ${document.name} ---\n${document.text}`)
    .join('\n\n');

  return {
    text,
    documents,
    charCount: totalCharacters,
    filesProcessed: documents.length,
    truncated: false,
  };
}
