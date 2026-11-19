import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConfiguredExamProviders } from '@/lib/server/exam-ai-provider-router';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,status,archived_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'approved' || profile.archived_at) {
      return NextResponse.json({ error: 'Approved platform administrator access is required.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [
      queued,
      running,
      needsAttention,
      failed,
      expiredLeases,
      oldestQueued,
    ] = await Promise.all([
      admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('provider', 'groq_api').eq('status', 'queued'),
      admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('provider', 'groq_api').eq('status', 'running'),
      admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('provider', 'groq_api').eq('status', 'needs_attention'),
      admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('provider', 'groq_api').eq('status', 'failed').gte('created_at', since),
      admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('provider', 'groq_api').eq('status', 'running').lte('lease_expires_at', now.toISOString()),
      admin.from('exam_generation_jobs').select('created_at').eq('provider', 'groq_api').eq('status', 'queued').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);

    const queryErrors = [queued.error, running.error, needsAttention.error, failed.error, expiredLeases.error, oldestQueued.error].filter(Boolean);
    if (queryErrors.length) {
      return NextResponse.json({ error: 'AI queue diagnostics are temporarily unavailable.' }, { status: 503 });
    }

    const oldestCreatedAt = oldestQueued.data?.created_at ? Date.parse(oldestQueued.data.created_at) : NaN;
    return NextResponse.json({
      ok: true,
      providersConfigured: getConfiguredExamProviders(),
      queue: {
        queued: queued.count || 0,
        running: running.count || 0,
        needsAttention: needsAttention.count || 0,
        failedLast24Hours: failed.count || 0,
        expiredLeases: expiredLeases.count || 0,
        oldestQueuedAgeSeconds: Number.isFinite(oldestCreatedAt) ? Math.max(0, Math.floor((now.getTime() - oldestCreatedAt) / 1000)) : null,
      },
      checkedAt: now.toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'AI queue diagnostics are temporarily unavailable.' }, { status: 503 });
  }
}
