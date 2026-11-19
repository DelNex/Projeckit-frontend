import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSystemEvent } from '@/lib/server/system-logger';

const recentByUser = new Map<string, number>();
const USER_ERROR_COOLDOWN_MS = 10_000;
const MAX_EVENT_BYTES = 8_000;

async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

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
  let rawBody = '';
  try {
    const boundedBody = await readBoundedBody(request, MAX_EVENT_BYTES);
    if (boundedBody === null) {
      return NextResponse.json({ error: 'Client error report is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    }
    rawBody = boundedBody;
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid error report.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid error report.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
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

  // Also check the durable event stream so cooldowns work across serverless
  // instances instead of relying only on this process's in-memory map.
  const admin = createAdminClient();
  const { data: recentEvents, error: recentEventsError } = await admin
    .from('audit_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('action', 'SYSTEM_ERROR')
    .contains('details', { source: 'client.runtime' })
    .gte('created_at', new Date(now - USER_ERROR_COOLDOWN_MS).toISOString())
    .limit(1);
  if (recentEventsError) {
    return NextResponse.json({ error: 'Error reporting is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (recentEvents?.length) {
    recentByUser.set(user.id, now);
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
