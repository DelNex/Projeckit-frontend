import { logSystemEvent } from '@/lib/server/system-logger';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to view exam questions.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('tenant_id,status,archived_at').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) return NextResponse.json({ error: 'Approved school access is required.' }, { status: 403 });
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: job } = await admin.from('exam_generation_jobs').select('tos_id,status,tenant_id').eq('id', id).eq('tenant_id', profile.tenant_id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Exam generation job was not found.' }, { status: 404 });
  if (!['completed', 'partial'].includes(job.status)) return NextResponse.json({ error: 'The exam is not ready yet.' }, { status: 409 });
  const { data: tos, error } = await admin.from('tos_documents').select('questions').eq('id', job.tos_id).eq('tenant_id', profile.tenant_id).maybeSingle();
  if (error || !tos) {
    await logSystemEvent({ severity: 'error', source: 'api.ai.exam-job-questions', message: error?.message || 'Could not reload saved exam questions.', method: 'GET', route: '/api/ai/exam-jobs/[id]/questions', code: 'EXAM_QUESTIONS_READ_FAILURE', tenantId: profile.tenant_id, userId: user.id });
    return NextResponse.json({ error: 'Could not reload saved exam questions.' }, { status: 503 });
  }
  return NextResponse.json({ questions: Array.isArray(tos.questions) ? tos.questions : [] }, { headers: { 'Cache-Control': 'no-store' } });
}
