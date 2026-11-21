import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherExamFailureMessage } from '@/lib/server/exam-teacher-errors';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to view generation limits.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status,archived_at,tenant_id').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
    return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  }

  const now = Date.now();
  const admin = createAdminClient();
  const [tenantResult, hourlyResult, dailyResult] = await Promise.all([
    admin.from('tenants').select('ai_hourly_user_limit,ai_daily_school_limit').eq('id', profile.tenant_id).maybeSingle(),
    admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('created_by', user.id).is('parent_job_id', null)
      .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0')
      .gte('created_at', new Date(now - 60 * 60_000).toISOString()),
    supabase.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id).is('parent_job_id', null)
      .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0')
      .gte('created_at', new Date(now - 24 * 60 * 60_000).toISOString()),
  ]);

  const quotaAvailable = !tenantResult.error && !hourlyResult.error && !dailyResult.error;
  const tosId = new URL(request.url).searchParams.get('tosId');
  let retryState = { retryAfterSeconds: 0, failedJobId: null as string | null, lastError: null as string | null, canRetry: true };
  if (tosId) {
    const { data: ownedTos, error: tosError } = await admin.from('tos_documents').select('id')
      .eq('id', tosId).eq('tenant_id', profile.tenant_id).maybeSingle();
    if (tosError || !ownedTos) return NextResponse.json({ error: 'The Table of Specifications was not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const { data: failedJob, error: failedJobError } = await admin.from('exam_generation_jobs')
      .select('id,error,progress,updated_at').eq('tenant_id', profile.tenant_id).eq('created_by', user.id)
      .eq('tos_id', tosId).eq('status', 'failed').is('parent_job_id', null)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (failedJobError) return NextResponse.json({ error: 'Could not load the exam retry status.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    if (failedJob) {
      const progress = failedJob.progress && typeof failedJob.progress === 'object' ? failedJob.progress as Record<string, unknown> : {};
      const status = Number(progress.providerStatus) || Number(String(failedJob.error || '').match(/HTTP\s+(\d{3})/i)?.[1]) || 0;
      const explicitRetryAt = Date.parse(String(progress.providerRetryAt || ''));
      const fallbackRetryAt = status === 429 ? Date.parse(failedJob.updated_at) + 2 * 60_000 : 0;
      const retryAt = Number.isFinite(explicitRetryAt) && explicitRetryAt > 0 ? explicitRetryAt : fallbackRetryAt;
      const retryAfterSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
      retryState = { retryAfterSeconds, failedJobId: failedJob.id, lastError: getTeacherExamFailureMessage(failedJob.error, progress), canRetry: retryAfterSeconds <= 0 };
    }
  }
  const hourlyLimit = Math.max(1, Math.trunc(Number(process.env.AI_HOURLY_USER_LIMIT) || Number(tenantResult.data?.ai_hourly_user_limit) || 5));
  const dailyLimit = Math.max(1, Math.trunc(Number(process.env.AI_DAILY_SCHOOL_LIMIT) || Number(tenantResult.data?.ai_daily_school_limit) || 100));

  return NextResponse.json({
    quota: quotaAvailable ? {
      hourly: { used: hourlyResult.count || 0, limit: hourlyLimit, remaining: Math.max(0, hourlyLimit - (hourlyResult.count || 0)) },
      daily: { used: dailyResult.count || 0, limit: dailyLimit, remaining: Math.max(0, dailyLimit - (dailyResult.count || 0)) },
    } : null,
    quotaAvailable,
    ...retryState,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
