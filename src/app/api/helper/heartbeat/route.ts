import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeHelperRequest, readHelperJson } from '@/lib/server/helper-auth';
import { logSystemEvent } from '@/lib/server/system-logger';

export async function POST(request: Request) {
  const denied = authorizeHelperRequest(request);
  if (denied) return denied;
  const requestId = request.headers.get('x-request-id') || request.headers.get('x-nf-request-id') || null;
  try {
    const body = await readHelperJson(request);
    if (!body || typeof body.helperId !== 'string' || !['idle', 'busy', 'needs_attention', 'offline'].includes(body.state)) {
      return NextResponse.json({ error: 'Invalid helper heartbeat.', requestId }, { status: 400 });
    }
    const result = await createAdminClient().from('helper_status').upsert({
      helper_id: body.helperId.slice(0, 80), version: typeof body.version === 'string' ? body.version.slice(0, 80) : null,
      state: body.state, note: typeof body.note === 'string' ? body.note.slice(0, 240) : null,
      current_job_id: typeof body.currentJobId === 'string' ? body.currentJobId : null,
      last_seen_at: new Date().toISOString(),
    });
    if (result.error) throw result.error;
    return NextResponse.json({ accepted: true, requestId });
  } catch (error) {
    await logSystemEvent({
      severity: 'error', source: 'helper.heartbeat', code: 'HELPER_HEARTBEAT_FAILED',
      message: error instanceof Error ? error.message : 'Unknown heartbeat error',
      method: 'POST', route: '/api/helper/heartbeat', requestId,
    });
    return NextResponse.json({ error: 'Could not save helper status.', requestId }, { status: 503 });
  }
}
