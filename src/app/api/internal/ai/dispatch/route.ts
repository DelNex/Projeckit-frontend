import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/server/cron-auth';
import { runNextGroqExamJobs } from '@/lib/server/groq-exam-worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Server-to-server endpoint for Supabase Cron or another trusted scheduler.
 * It dispatches up to four jobs per invocation; the database claim RPC remains
 * the concurrency authority when scheduled invocations overlap.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    await runNextGroqExamJobs();
    return NextResponse.json({ ok: true, workerInvocation: 'completed' }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[exam-dispatch] Scheduled dispatch failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Exam dispatch failed.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
