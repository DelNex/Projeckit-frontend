import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSystemEvent } from '@/lib/server/system-logger';

const recentByUser = new Map<string, number>();
const USER_ERROR_COOLDOWN_MS = 10_000;
const MAX_EVENT_BYTES = 8_000;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_EVENT_BYTES) {
    return NextResponse.json({ error: 'Client error report is too large.' }, { status: 413 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('status,archived_at,tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at) {
    return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid error report.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > MAX_EVENT_BYTES) {
    return NextResponse.json({ error: 'Invalid or oversized error report.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }

  const message = String(body.message || 'Unknown client-side error').slice(0, 1200);
  const name = String(body.name || 'ClientError').slice(0, 120);
  const route = String(body.route || '').slice(0, 240);
  const stack = String(body.stack || '').slice(0, 3000);
  const digest = String(body.digest || '').slice(0, 160);

  const now = Date.now();
  const lastReportedAt = recentByUser.get(user.id) || 0;
  if (now - lastReportedAt < USER_ERROR_COOLDOWN_MS) {
    return NextResponse.json({ accepted: true, deduplicated: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }
  recentByUser.set(user.id, now);
  if (recentByUser.size > 1_000) {
    const oldestKey = recentByUser.keys().next().value;
    if (oldestKey) recentByUser.delete(oldestKey);
  }

  await logSystemEvent({
    severity: 'error',
    source: 'client.runtime',
    message,
    code: 'CLIENT_RUNTIME_FAILURE',
    userId: user.id,
    tenantId: profile.tenant_id,
    metadata: { name, route, stack, digest },
  });

  return NextResponse.json({ accepted: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
