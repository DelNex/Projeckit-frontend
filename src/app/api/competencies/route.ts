import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getApprovedCaller() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: 'Sign in to access the school competency library.' }, { status: 401 }) };
  const { data: profile, error } = await supabase.from('profiles')
    .select('tenant_id,status,archived_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
    return { response: NextResponse.json({ error: 'Approved school access is required.' }, { status: 403 }) };
  }
  return { user, tenantId: profile.tenant_id, admin: createAdminClient() };
}

export async function GET() {
  try {
    const caller = await getApprovedCaller();
    if (caller.response) return caller.response;
    const { data, error } = await caller.admin!.from('tenant_competencies')
      .select('id,code,description')
      .eq('tenant_id', caller.tenantId)
      .order('description', { ascending: true })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ competencies: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[competencies GET] Could not load school library:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not load the school competency library. Apply the tenant competency library migration and try again.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const caller = await getApprovedCaller();
    if (caller.response) return caller.response;
    const body = await request.json().catch(() => null) as { competencies?: unknown } | null;
    if (!body || !Array.isArray(body.competencies)) return NextResponse.json({ error: 'A competency list is required.' }, { status: 400 });
    const records = body.competencies.flatMap((entry: any) => {
      const code = typeof entry?.code === 'string' ? entry.code.trim().slice(0, 80) : '';
      const description = typeof entry?.description === 'string' ? entry.description.trim().slice(0, 500) : '';
      if (!code || !description) return [];
      return [{ tenant_id: caller.tenantId, code, description, created_by: caller.user!.id }];
    }).slice(0, 200);
    if (!records.length) return NextResponse.json({ saved: 0 });
    const { error } = await caller.admin!.from('tenant_competencies')
      .upsert(records, { onConflict: 'tenant_id,code,description', ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ saved: records.length });
  } catch (error) {
    console.error('[competencies POST] Could not save school library:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not save competencies to the school library. Apply the tenant competency library migration and try again.' }, { status: 503 });
  }
}
