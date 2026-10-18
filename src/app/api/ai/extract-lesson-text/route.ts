import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  extractLessonFiles,
  LessonFileInput,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_COUNT,
} from '@/lib/server/lesson-parser';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller session
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to extract lesson documents.' },
        { status: 401 }
      );
    }

    // 2. Parse form-data
    const formData = await request.formData();
    const uploadedFiles = formData.getAll('files') as File[];

    if (!uploadedFiles || uploadedFiles.length === 0) {
      // Also check single file fallback 'file'
      const single = formData.get('file') as File | null;
      if (single) {
        uploadedFiles.push(single);
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded. Please attach at least one lesson document.' },
        { status: 400 }
      );
    }

    if (uploadedFiles.length > MAX_FILES_COUNT) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES_COUNT} files allowed per upload.` },
        { status: 400 }
      );
    }

    const filePayloads: LessonFileInput[] = [];

    for (const f of uploadedFiles) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File '${f.name}' exceeds the 10 MB maximum limit.` },
          { status: 400 }
        );
      }

      const arrayBuffer = await f.arrayBuffer();
      filePayloads.push({
        name: f.name,
        buffer: Buffer.from(arrayBuffer),
        size: f.size,
      });
    }

    const result = await extractLessonFiles(filePayloads);

    return NextResponse.json({
      success: true,
      text: result.text,
      documents: result.documents,
      files: result.documents,
      charCount: result.charCount,
      filesProcessed: result.filesProcessed,
      truncated: result.truncated,
      notice: result.notice,
    });
  } catch (err: any) {
    console.error('[ExtractLessonText] Extraction failed:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to extract text from lesson documents.' },
      { status: 400 }
    );
  }
}
