/**
 * Project KIT — Client Lesson Text Extractor Bridge
 * Uploads lesson files directly to private Supabase Storage, then asks the
 * authenticated server endpoint to extract them without passing file bytes
 * through the hosting platform's API request-size limit.
 */

import { createClient } from '@/lib/supabase/client';

export interface LessonExtractionClientResult {
  text: string;
  documents: Array<{ name: string; text: string }>;
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
    if (file.size > 50 * 1024 * 1024) {
      throw new Error(`File '${file.name}' exceeds the 50 MB maximum. Split the material into smaller files.`);
    }
  }

  const documents: Array<{ name: string; text: string }> = [];
  let totalCharacters = 0;

  // Parse and return one document at a time. This keeps long uploads bounded and
  // preserves document boundaries for the sequential Gemini helper.
  for (const file of files) {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error('Sign in again before uploading lesson materials.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180) || 'lesson-material';
    const storagePath = `${authData.user.id}/lesson-imports/${crypto.randomUUID()}/${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from('lesson-uploads')
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadError) throw new Error(`Could not upload '${file.name}': ${uploadError.message}`);

    let response: Response;
    try {
      response = await fetch('/api/ai/extract-lesson-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, name: file.name }),
      });
    } catch (error) {
      await supabase.storage.from('lesson-uploads').remove([storagePath]);
      throw error;
    }
    const data = await response.json().catch(() => null);
    await supabase.storage.from('lesson-uploads').remove([storagePath]);
    if (!data) throw new Error(`The server returned an invalid extraction response for '${file.name}'.`);
    if (!response.ok) throw new Error(data.error || `Failed to extract text from ${file.name}.`);

    const extracted = Array.isArray(data.documents) ? data.documents : data.files;
    const document = extracted?.[0];
    if (!document || typeof document.text !== 'string') {
      throw new Error(`The text extractor returned no readable content for ${file.name}.`);
    }
    totalCharacters += document.text.length;
    if (totalCharacters > 500000) {
      throw new Error('These documents contain more than 500,000 characters. Split them into smaller uploads so no lesson content is dropped.');
    }
    documents.push({ name: document.name || file.name, text: document.text });
  }

  const text = documents.map((document) => `--- ${document.name} ---\n${document.text}`).join('\n\n');

  return {
    text,
    documents,
    charCount: totalCharacters,
    filesProcessed: documents.length,
    truncated: false,
  };
}
