import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jobBelongsToTenant } from '@/lib/server/exam-jobs';

async function scopedJob(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: 'Sign in to view exam generation.' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('tenant_id,status,archived_at').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) return { response: NextResponse.json({ error: 'Your account does not have access to this job.' }, { status: 403 }) };
  const admin = createAdminClient();
  await admin.rpc('cleanup_exam_job_payloads');
  const { data: job, error } = await admin.from('exam_generation_jobs').select('id,tos_id,status,progress,error,result_summary,created_at,updated_at,finished_at,created_by,tenant_id').eq('id', id).eq('tenant_id', profile.tenant_id).maybeSingle();
  if (error || !jobBelongsToTenant(job, profile.tenant_id)) return { response: NextResponse.json({ error: 'Exam generation job was not found.' }, { status: 404 }) };
  return { job, admin };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await scopedJob(id);
    if (result.response) return result.response;
    const { job, admin } = result as any;
    let queuePosition: number | null = null;
    if (job.status === 'queued') {
      const count = await admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('created_at', job.created_at);
      queuePosition = count.count || 1;
    }
    return NextResponse.json({ id: job.id, tosId: job.tos_id, status: job.status, progress: job.progress, error: job.error, resultSummary: job.result_summary, queuePosition }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load exam generation status.' }, { status: 503 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await scopedJob(id);
    if (result.response) return result.response;
    const { job, admin } = result as any;
    if (!['queued', 'running'].includes(job.status)) return NextResponse.json({ error: 'This generation job can no longer be cancelled.' }, { status: 409 });
    const { error } = await admin.from('exam_generation_jobs').update({ status: 'cancelled', error: 'Cancelled by the user.', finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: {} }).eq('id', id).eq('tenant_id', job.tenant_id).in('status', ['queued', 'running']);
    if (error) throw error;
    return NextResponse.json({ accepted: true, status: 'cancelled' });
  } catch {
    return NextResponse.json({ error: 'Could not cancel exam generation.' }, { status: 503 });
  }
}
