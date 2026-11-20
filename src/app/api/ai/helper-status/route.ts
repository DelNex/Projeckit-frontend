import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConfiguredExamProviders } from '@/lib/server/exam-ai-provider-router';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to view helper status.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status,archived_at,tenant_id').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
    return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  }

  const providers = getConfiguredExamProviders();
  const provider = providers[0] || null;
  const model = provider === 'groq' ? process.env.GROQ_MODEL || 'openai/gpt-oss-120b' : null;
  const now = Date.now();
  const params = new URL(request.url).searchParams;
  const tosId = params.get('tosId');

  // This is a read-only preview for the teacher UI. The enqueue RPC remains
  // authoritative and applies the same quotas atomically when a job is created.
  const admin = createAdminClient();
  const [tenantResult, hourlyResult, dailyResult, recentFailureResult] = await Promise.all([
    admin.from('tenants').select('ai_hourly_user_limit,ai_daily_school_limit').eq('id', profile.tenant_id).maybeSingle(),
    admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('created_by', user.id)
      .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0')
      .gte('created_at', new Date(now - 60 * 60_000).toISOString()),
    supabase.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id)
      .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0')
      .gte('created_at', new Date(now - 24 * 60 * 60_000).toISOString()),
    tosId
      ? supabase.from('exam_generation_jobs').select('id,updated_at').eq('tenant_id', profile.tenant_id).eq('tos_id', tosId)
        .is('parent_job_id', null).eq('status', 'failed')
        .gte('updated_at', new Date(now - 2 * 60_000).toISOString())
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const quotaAvailable = !tenantResult.error && !hourlyResult.error && !dailyResult.error;
  const hourlyLimit = Math.max(1, Math.trunc(Number(process.env.AI_HOURLY_USER_LIMIT) || Number(tenantResult.data?.ai_hourly_user_limit) || 5));
  const dailyLimit = Math.max(1, Math.trunc(Number(process.env.AI_DAILY_SCHOOL_LIMIT) || Number(tenantResult.data?.ai_daily_school_limit) || 100));
  const hourlyUsed = hourlyResult.count || 0;
  const dailyUsed = dailyResult.count || 0;
  const retryAt = recentFailureResult.data?.updated_at
    ? Date.parse(recentFailureResult.data.updated_at) + 2 * 60_000
    : 0;
  const retryAfterSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));

  return NextResponse.json({
    state: providers.length ? 'online' : 'offline',
    provider,
    providers,
    model,
    note: providers.length ? undefined : 'No server-side exam AI provider is configured.',
    quota: quotaAvailable ? {
      hourly: { used: hourlyUsed, limit: hourlyLimit, remaining: Math.max(0, hourlyLimit - hourlyUsed) },
      daily: { used: dailyUsed, limit: dailyLimit, remaining: Math.max(0, dailyLimit - dailyUsed) },
    } : null,
    quotaAvailable,
    retryAfterSeconds,
    lastSeenSeconds: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
