import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeHelperRequest, readHelperJson } from '@/lib/server/helper-auth';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = authorizeHelperRequest(request);
  if (denied) return denied;
  try {
    const [{ id }, body] = await Promise.all([context.params, readHelperJson(request)]);
    if (!body || typeof body.helperId !== 'string' || typeof body.reason !== 'string') return NextResponse.json({ error: 'Invalid job failure report.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: job } = await admin.from('exam_generation_jobs').select('id,tenant_id,created_by,claimed_by,status,parent_job_id').eq('id', id).maybeSingle();
    if (!job || job.claimed_by !== body.helperId || job.status !== 'running') return NextResponse.json({ error: 'Job lease not found.' }, { status: 404 });
    const needsAttention = body.needsAttention === true;
    const status = needsAttention ? 'needs_attention' : body.reason === 'helper restarted' ? 'queued' : 'failed';
    const { error } = await admin.from('exam_generation_jobs').update({ status, error: String(body.reason).slice(0, 500), claimed_by: null, lease_expires_at: status === 'queued' ? new Date().toISOString() : null, finished_at: status === 'queued' ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    if (job.parent_job_id && status !== 'queued') {
      const { data: parent } = await admin.from('exam_generation_jobs').update({ status, error: String(body.reason).slice(0, 500), finished_at: new Date().toISOString(), claimed_by: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq('id', job.parent_job_id).eq('status', 'running').select('id').maybeSingle();
      if (parent) await admin.from('audit_logs').insert({ tenant_id: job.tenant_id, user_id: job.created_by, action: 'AI_EXAM_GENERATION', details: { job_id: parent.id, status, reason: String(body.reason).slice(0, 240) } });
    }
    await admin.from('helper_status').upsert({ helper_id: body.helperId, state: needsAttention ? 'needs_attention' : 'idle', note: needsAttention ? String(body.reason).slice(0, 240) : null, current_job_id: null, last_seen_at: new Date().toISOString() });
    if (status === 'failed' || status === 'needs_attention') await admin.from('audit_logs').insert({ tenant_id: job.tenant_id, user_id: job.created_by, action: 'AI_EXAM_GENERATION', details: { job_id: id, status, reason: String(body.reason).slice(0, 240) } });
    return NextResponse.json({ accepted: true, status });
  } catch {
    return NextResponse.json({ error: 'Could not record the job failure.' }, { status: 503 });
  }
}
