import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUploadLimits } from '@/lib/server/upload-limits';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Sign in to view upload limits.' }, { status: 401 });
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('tenant_id, status, archived_at').eq('id', user.id).maybeSingle();
    if (profileError || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
      return NextResponse.json({ error: 'Your account has no active school upload limits.' }, { status: 403 });
    }
    const limits = await getUploadLimits(createAdminClient(), profile.tenant_id);
    return NextResponse.json(limits, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[settings/limits GET]', error);
    return NextResponse.json({ error: 'Could not load upload limits.' }, { status: 503 });
  }
}
