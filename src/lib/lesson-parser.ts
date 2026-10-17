/**
 * Project KIT — Client Lesson Text Extractor Bridge
 * Delegates document extraction strictly to the secure server extraction endpoint.
 */

export interface LessonExtractionClientResult {
  text: string;
  charCount: number;
  filesProcessed: number;
  truncated: boolean;
  notice?: string;
}

/**
 * Extracts readable lesson text from a single file by posting to the server extractor.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractTextFromFiles([file]);
  return result.text;
}

/**
 * Extracts readable lesson text from multiple files via the server extractor.
 */
export async function extractTextFromFiles(files: File[]): Promise<LessonExtractionClientResult> {
  if (!files || files.length === 0) {
    throw new Error('No files selected for text extraction.');
  }

  // Pre-check basic client-side limits
  if (files.length > 5) {
    throw new Error('Maximum 5 files allowed per upload.');
  }

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error(`File '${file.name}' exceeds the 10 MB maximum limit.`);
    }
  }

  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));

  const response = await fetch('/api/ai/extract-lesson-text', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Failed to extract text from document.');
  }

  return {
    text: data.text,
    charCount: data.charCount,
    filesProcessed: data.filesProcessed,
    truncated: Boolean(data.truncated),
    notice: data.notice,
  };
}
