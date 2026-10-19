import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeHelperRequest, readHelperJson } from '@/lib/server/helper-auth';

export async function POST(request: Request) {
  const denied = authorizeHelperRequest(request);
  if (denied) return denied;
  try {
    const body = await readHelperJson(request);
    if (!body || typeof body.helperId !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(body.helperId)) return NextResponse.json({ error: 'A valid helperId is required.' }, { status: 400 });
    const admin = createAdminClient();
    await admin.rpc('cleanup_exam_job_payloads');
    const { data, error } = await admin.rpc('claim_exam_job', { p_helper_id: body.helperId, p_lease_seconds: 120 });
    if (error) throw error;
    const job = Array.isArray(data) ? data[0] || null : data || null;
    await admin.from('helper_status').upsert({ helper_id: body.helperId, state: job ? 'busy' : 'idle', current_job_id: job?.id || null, last_seen_at: new Date().toISOString() });
    return NextResponse.json({ job: job ? { id: job.id, jobKind: job.job_kind, parentJobId: job.parent_job_id, repairRound: job.repair_round, attempt: job.attempts, payload: job.payload } : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[helper claim] Failed to claim a job.');
    return NextResponse.json({ error: 'Could not claim a queued job.' }, { status: 503 });
  }
}
