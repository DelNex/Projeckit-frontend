import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Sign in to view helper status.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status,archived_at').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at) return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  const configured = Boolean(process.env.GROQ_API_KEY);
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const state = configured ? 'online' : 'offline';
  return NextResponse.json({ state, provider: 'Groq', model, note: configured ? undefined : 'GROQ_API_KEY is not configured on the server.', lastSeenSeconds: null }, { headers: { 'Cache-Control': 'no-store' } });
}
