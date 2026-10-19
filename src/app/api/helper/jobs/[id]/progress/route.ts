import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeHelperRequest, readHelperJson } from '@/lib/server/helper-auth';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = authorizeHelperRequest(request);
  if (denied) return denied;
  try {
    const [{ id }, body] = await Promise.all([context.params, readHelperJson(request)]);
    if (!body || typeof body.helperId !== 'string' || !body.progress || typeof body.progress !== 'object') return NextResponse.json({ error: 'Invalid progress update.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: job, error: readError } = await admin.from('exam_generation_jobs').select('id,status,claimed_by').eq('id', id).maybeSingle();
    if (readError || !job || job.claimed_by !== body.helperId || job.status !== 'running') return NextResponse.json({ error: 'Job lease not found.' }, { status: 404 });
    const progress = { stage: String(body.progress.stage || '').slice(0, 40), label: String(body.progress.label || '').slice(0, 240), completedChunks: Number(body.progress.completedChunks || 0), totalChunks: Number(body.progress.totalChunks || 0) };
    const { error } = await admin.from('exam_generation_jobs').update({ progress, lease_expires_at: new Date(Date.now() + 120_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('claimed_by', body.helperId);
    if (error) throw error;
    await admin.from('helper_status').upsert({ helper_id: body.helperId, state: 'busy', current_job_id: id, last_seen_at: new Date().toISOString() });
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: 'Could not save job progress.' }, { status: 503 });
  }
}
