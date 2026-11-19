import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getConfiguredExamProviders } from '@/lib/server/exam-ai-provider-router';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Sign in to view helper status.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status,archived_at').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at) return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  const providers = getConfiguredExamProviders();
  const configured = providers.length > 0;
  const state = configured ? 'online' : 'offline';
  return NextResponse.json({
    state,
    provider: providers.join(', ') || null,
    providers,
    model: configured ? 'Configured server-side AI model' : null,
    note: configured ? undefined : 'No server-side exam AI provider is configured.',
    lastSeenSeconds: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
