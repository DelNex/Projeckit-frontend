import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeHelperRequest, readHelperJson } from '@/lib/server/helper-auth';
import { finalizeExamJob } from '@/lib/server/exam-jobs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = authorizeHelperRequest(request);
  if (denied) return denied;
  try {
    const [{ id }, body] = await Promise.all([context.params, readHelperJson(request)]);
    if (!body || typeof body.helperId !== 'string' || typeof body.text !== 'string' || body.text.length > 1_500_000) return NextResponse.json({ error: 'Invalid Gemini result.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: job } = await admin.from('exam_generation_jobs').select('claimed_by,status,tos_id').eq('id', id).maybeSingle();
    if (!job || job.claimed_by !== body.helperId || job.status !== 'running') return NextResponse.json({ error: 'Job lease not found.' }, { status: 404 });
    const result = await finalizeExamJob(id, body.text);
    let savedItemNumbers: number[] = [];
    if (result.status === 'completed' || result.status === 'partial') {
      const { data: savedTos } = await admin.from('tos_documents').select('questions').eq('id', job.tos_id).maybeSingle();
      savedItemNumbers = Array.isArray(savedTos?.questions)
        ? savedTos.questions.map((question: any) => Number(question?.item_number)).filter(Number.isInteger)
        : [];
    }
    await admin.from('helper_status').upsert({ helper_id: body.helperId, state: 'idle', current_job_id: null, last_seen_at: new Date().toISOString() });
    return NextResponse.json({ ...result, ...(savedItemNumbers.length ? { savedItemNumbers } : {}) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save generated exam questions.' }, { status: 500 });
  }
}
