import { after, NextResponse } from 'next/server';
import { runGroqExamJob } from '@/lib/server/groq-exam-worker';

export const maxDuration = 60;
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
  await admin.rpc('expire_unserviceable_exam_jobs');
  await admin.rpc('cleanup_exam_job_payloads');
  const { data: job, error } = await admin.from('exam_generation_jobs').select('id,tos_id,status,provider,lease_expires_at,progress,error,result_summary,created_at,updated_at,finished_at,created_by,tenant_id').eq('id', id).eq('tenant_id', profile.tenant_id).maybeSingle();
  if (error || !jobBelongsToTenant(job, profile.tenant_id)) return { response: NextResponse.json({ error: 'Exam generation job was not found.' }, { status: 404 }) };
  return { job, admin };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await scopedJob(id);
    if (result.response) return result.response;
    const { job, admin } = result as any;
    const leaseExpired = Boolean(job.lease_expires_at) && Date.parse(job.lease_expires_at) <= Date.now();
    let recoveryJobId: string | null = null;

    if (job.provider === 'groq_api' && ['queued', 'needs_attention'].includes(job.status)) {
      recoveryJobId = job.id;
    } else if (job.provider === 'groq_api' && job.status === 'running') {
      const repairJobId = typeof job.progress?.repairJobId === 'string' ? job.progress.repairJobId : null;
      if (repairJobId) {
        // A root job with no lease may be waiting for its repair child. Resume
        // the child, never regenerate the completed root batch.
        const { data: repairJob } = await admin.from('exam_generation_jobs')
          .select('id,status,provider,lease_expires_at')
          .eq('id', repairJobId)
          .eq('parent_job_id', job.id)
          .maybeSingle();
        const repairLeaseExpired = Boolean(repairJob?.lease_expires_at) && Date.parse(repairJob.lease_expires_at) <= Date.now();
        if (repairJob?.provider === 'groq_api' && (
          ['queued', 'needs_attention'].includes(repairJob.status)
          || (repairJob.status === 'running' && repairLeaseExpired)
        )) recoveryJobId = repairJob.id;
      } else if (leaseExpired || !job.lease_expires_at) {
        recoveryJobId = job.id;
      }
    }

    if (recoveryJobId) {
      after(async () => {
        try {
          await runGroqExamJob(recoveryJobId!, admin);
        } catch (error) {
          console.error('[Groq worker] Status-poll recovery failed:', error instanceof Error ? error.message : 'unknown error');
        }
      });
    }
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
    if (!['queued', 'running', 'needs_attention'].includes(job.status)) return NextResponse.json({ error: 'This generation job can no longer be cancelled.' }, { status: 409 });
    const { error } = await admin.from('exam_generation_jobs').update({ status: 'cancelled', error: 'Cancelled by the user.', finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: {}, claimed_by: null, lease_expires_at: null }).eq('id', id).eq('tenant_id', job.tenant_id).in('status', ['queued', 'running', 'needs_attention']);
    if (error) throw error;
    await admin.from('exam_generation_jobs').update({ status: 'cancelled', error: 'Cancelled by the user.', finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: {}, claimed_by: null, lease_expires_at: null }).eq('parent_job_id', id).in('status', ['queued', 'running', 'needs_attention']);
    return NextResponse.json({ accepted: true, status: 'cancelled' });
  } catch {
    return NextResponse.json({ error: 'Could not cancel exam generation.' }, { status: 503 });
  }
}
