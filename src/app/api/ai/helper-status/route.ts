import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Sign in to view helper status.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status,archived_at').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at) return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  const { data } = await createAdminClient().from('helper_status').select('state,note,last_seen_at').order('last_seen_at', { ascending: false }).limit(1).maybeSingle();
  const lastSeenSeconds = data?.last_seen_at ? Math.max(0, Math.floor((Date.now() - Date.parse(data.last_seen_at)) / 1000)) : null;
  const state = lastSeenSeconds === null || lastSeenSeconds >= 45 || data?.state === 'offline' ? 'offline' : data?.state === 'needs_attention' ? 'needs_attention' : data?.state === 'busy' ? 'busy' : 'online';
  return NextResponse.json({ state, note: state === 'needs_attention' ? data?.note : undefined, lastSeenSeconds }, { headers: { 'Cache-Control': 'no-store' } });
}
