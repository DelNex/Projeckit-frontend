import { NextResponse } from 'next/server';

/** @deprecated Use the durable pull-based /api/ai/exam-jobs queue. */
export async function POST() {
  return NextResponse.json({ error: 'This exam generation endpoint has been retired. Start a durable job through /api/ai/exam-jobs.' }, { status: 410 });
}
