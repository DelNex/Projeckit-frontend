import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSystemEvent } from '@/lib/server/system-logger';
import { runNextGroqExamJob } from '@/lib/server/groq-exam-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET || '';
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 32) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

/** Called by the database scheduler; never exposed to teacher sessions. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const admin = createAdminClient();
    const [expired, cleaned] = await Promise.all([
      admin.rpc('expire_unserviceable_exam_jobs'),
      admin.rpc('cleanup_exam_job_payloads'),
    ]);
    if (expired.error || cleaned.error) {
      await logSystemEvent({
        severity: 'warning',
        source: 'exam.scheduler.maintenance',
        message: 'Exam queue maintenance returned an error.',
        code: 'EXAM_QUEUE_MAINTENANCE',
        metadata: {
          expireError: expired.error?.message || null,
          cleanupError: cleaned.error?.message || null,
        },
      });
    }
    await runNextGroqExamJob(admin);
    return NextResponse.json({ ok: true, accepted: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await logSystemEvent({
      severity: 'error',
      source: 'exam.scheduler',
      message: error instanceof Error ? error.message : 'Scheduled exam worker failed.',
      code: 'EXAM_SCHEDULER_FAILURE',
      method: 'POST',
      route: '/api/internal/exam-worker',
    });
    return NextResponse.json({ error: 'Scheduled exam processing failed.' }, { status: 500 });
  }
}
