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
  const state = providers.length ? 'online' : 'offline';
  const provider = providers[0] || null;
  const model = provider === 'groq' ? process.env.GROQ_MODEL || 'openai/gpt-oss-120b' : null;
  return NextResponse.json({ state, provider, providers, model, note: providers.length ? undefined : 'No server-side exam AI provider is configured.', lastSeenSeconds: null }, { headers: { 'Cache-Control': 'no-store' } });
}
