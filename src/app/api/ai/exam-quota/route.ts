import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
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
    admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('created_by', user.id)
      .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0')
      .gte('created_at', new Date(now - 60 * 60_000).toISOString()),
    supabase.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id)
      .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0')
      .gte('created_at', new Date(now - 24 * 60 * 60_000).toISOString()),
  ]);

  const quotaAvailable = !tenantResult.error && !hourlyResult.error && !dailyResult.error;
  const hourlyLimit = Math.max(1, Math.trunc(Number(process.env.AI_HOURLY_USER_LIMIT) || Number(tenantResult.data?.ai_hourly_user_limit) || 5));
  const dailyLimit = Math.max(1, Math.trunc(Number(process.env.AI_DAILY_SCHOOL_LIMIT) || Number(tenantResult.data?.ai_daily_school_limit) || 100));

  return NextResponse.json({
    quota: quotaAvailable ? {
      hourly: { used: hourlyResult.count || 0, limit: hourlyLimit, remaining: Math.max(0, hourlyLimit - (hourlyResult.count || 0)) },
      daily: { used: dailyResult.count || 0, limit: dailyLimit, remaining: Math.max(0, dailyLimit - (dailyResult.count || 0)) },
    } : null,
    quotaAvailable,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
