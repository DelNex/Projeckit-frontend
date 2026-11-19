import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SYSTEM_ACTIONS = ['SYSTEM_ERROR', 'SYSTEM_WARNING', 'SYSTEM_INFO', 'AI_PROVIDER_FAILURE', 'EXAM_WORKER_FAILURE'];

function safeJobError(value: unknown): string {
  if (typeof value !== 'string') return 'Exam generation failed. Review the job and retry.';
  return value
    .replace(/Bearer\\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\\b(?:gsk_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/gi, '[REDACTED]')
    .replace(/(api[_-]?key|token|password|secret)\\s*[:=]\\s*[^\\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 700);
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Sign in to view system events.' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,status,archived_at,tenant_id,is_platform_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || (profile.role !== 'admin' && !profile.is_platform_admin) || profile.status !== 'approved' || profile.archived_at) {
      return NextResponse.json({ error: 'Approved administrator access is required.' }, { status: 403 });
    }

    const limitValue = Number(new URL(request.url).searchParams.get('limit') || 100);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, Math.floor(limitValue))) : 100;
    const admin = createAdminClient();
    let query = admin.from('audit_logs')
      .select('id,tenant_id,user_id,action,ip,device,details,created_at')
      .in('action', SYSTEM_ACTIONS)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Tenant admins only see events attributed to their own school.
    // Platform admins can inspect cross-tenant and unscoped server failures.
    if (!profile.is_platform_admin) {
      if (!profile.tenant_id) return NextResponse.json({ events: [] }, { headers: { 'Cache-Control': 'no-store' } });
      query = query.eq('tenant_id', profile.tenant_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Include durable generation failures as well as application-level events.
    // This makes earlier failed jobs visible even if they predate the new logger.
    let failedJobsQuery = admin.from('exam_generation_jobs')
      .select('id,tenant_id,created_by,status,provider,error,updated_at')
      .in('status', ['failed', 'needs_attention'])
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (!profile.is_platform_admin && profile.tenant_id) {
      failedJobsQuery = failedJobsQuery.eq('tenant_id', profile.tenant_id);
    }
    const { data: failedJobs, error: failedJobsError } = await failedJobsQuery;
    if (failedJobsError) throw failedJobsError;

    const jobEvents = (failedJobs || []).map((job: any) => ({
      id: `job-${job.id}`,
      tenant_id: job.tenant_id,
      user_id: job.created_by,
      action: job.status === 'failed' ? 'EXAM_GENERATION_FAILED' : 'EXAM_GENERATION_NEEDS_ATTENTION',
      ip: null,
      device: 'server',
      details: {
        severity: job.status === 'failed' ? 'error' : 'warning',
        source: 'exam.worker',
        message: safeJobError(job.error) || 'Exam generation requires administrator review.',
        jobId: job.id,
        provider: job.provider,
        status: job.status,
      },
      created_at: job.updated_at,
    }));

    const byId = new Map<string, any>();
    for (const event of [...(data || []), ...jobEvents]) byId.set(event.id, event);
    const events = [...byId.values()]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);

    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[admin/system-logs GET]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load system events.' }, { status: 500 });
  }
}
