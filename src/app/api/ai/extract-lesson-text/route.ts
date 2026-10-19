import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  extractLessonFiles,
  LessonFileInput,
} from '@/lib/server/lesson-parser';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatUploadLimitError, getUploadLimits, isUploadWithinLimit } from '@/lib/server/upload-limits';

export const maxDuration = 60;

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

    // File bytes go directly from the browser to private Storage, avoiding
    // Vercel's API request-size limit. This route only receives a small path.
    const body = await request.json().catch(() => null) as { storagePath?: unknown; name?: unknown } | null;
    if (!body || typeof body.storagePath !== 'string' || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Missing lesson upload reference.' }, { status: 400 });
    }

    const storagePath = body.storagePath;
    const name = body.name.slice(0, 240);
    if (!storagePath.startsWith(`${caller.id}/lesson-imports/`) || storagePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid lesson upload reference.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('tenant_id, status, archived_at').eq('id', caller.id).maybeSingle();
    if (profileError || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
      return NextResponse.json({ error: 'Your account has no active school upload limits.' }, { status: 403 });
    }
    const limits = await getUploadLimits(admin, profile.tenant_id);
    const maxFileSizeBytes = limits.maxModuleUploadMb * 1024 * 1024;
    const { data: storedFile, error: downloadError } = await admin.storage.from('lesson-uploads').download(storagePath);
    if (downloadError || !storedFile) {
      return NextResponse.json({ error: 'Could not read the uploaded lesson file. Please upload it again.' }, { status: 400 });
    }

    try {
      if (!isUploadWithinLimit(storedFile.size, limits.maxModuleUploadMb)) {
        return NextResponse.json({ error: formatUploadLimitError(storedFile.size, limits.maxModuleUploadMb) }, { status: 400 });
      }
      const filePayload: LessonFileInput = {
        name,
        buffer: Buffer.from(await storedFile.arrayBuffer()),
        size: storedFile.size,
      };
      const result = await extractLessonFiles([filePayload], maxFileSizeBytes);

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
    } finally {
      await admin.storage.from('lesson-uploads').remove([storagePath]);
    }
  } catch (err: any) {
    console.error('[ExtractLessonText] Extraction failed:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to extract text from lesson documents.' },
      { status: 400 }
    );
  }
}
