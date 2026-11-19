import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SYSTEM_ACTIONS = ['SYSTEM_ERROR', 'SYSTEM_WARNING', 'SYSTEM_INFO', 'AI_PROVIDER_FAILURE', 'EXAM_WORKER_FAILURE'];

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

    if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'approved' || profile.archived_at) {
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
    return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[admin/system-logs GET]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load system events.' }, { status: 500 });
  }
}
