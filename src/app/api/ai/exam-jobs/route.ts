import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildExamPrompt, buildSlotsFromTos, toLessonChunks } from '@/lib/server/exam-jobs';
import { getExamAiProvider } from '@/lib/server/exam-ai-provider';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: 'Sign in before generating an exam.' }, { status: 401 }) };
  const { data: profile, error } = await supabase.from('profiles').select('id,tenant_id,status,archived_at').eq('id', user.id).maybeSingle();
  if (error || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) return { response: NextResponse.json({ error: 'Your account does not have access to exam generation.' }, { status: 403 }) };
  return { user, profile, admin: createAdminClient() };
}

export async function POST(request: Request) {
  try {
    const caller = await getCaller();
    if (caller.response) return caller.response;
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 1_800_000) return NextResponse.json({ error: 'Lesson text is too large to queue. Reduce the extracted text and try again.' }, { status: 413 });
    const body = JSON.parse(raw) as { tosId?: string; lessonText?: string; lessonDocuments?: Array<{ name: string; text: string }>; repairItemNumber?: number };
    if (!body.tosId) return NextResponse.json({ error: 'Choose a Table of Specifications before generating an exam.' }, { status: 400 });
    const { data: tos, error: tosError } = await caller.admin!.from('tos_documents').select('id,tenant_id,rows,target_items,questions').eq('id', body.tosId).eq('tenant_id', caller.profile!.tenant_id).maybeSingle();
    if (tosError || !tos) return NextResponse.json({ error: 'The Table of Specifications was not found in your school.' }, { status: 404 });
    const documents = Array.isArray(body.lessonDocuments) ? body.lessonDocuments : body.lessonText?.trim() ? [{ name: 'Lesson materials', text: body.lessonText }] : [];
    if (!documents.length || documents.some((doc) => !doc || typeof doc.name !== 'string' || typeof doc.text !== 'string')) return NextResponse.json({ error: 'Upload or extract lesson text before generating an exam.' }, { status: 400 });
    if (documents.reduce((sum, doc) => sum + doc.text.length, 0) > 500_000) return NextResponse.json({ error: 'These lessons contain more than 500,000 characters. Split them into smaller uploads.' }, { status: 413 });

    const { data: activeJob, error: activeJobError } = await caller.admin!.from('exam_generation_jobs')
      .select('id,status,created_at')
      .eq('tenant_id', caller.profile!.tenant_id)
      .eq('tos_id', tos.id)
      .is('parent_job_id', null)
      .in('status', ['queued', 'running', 'needs_attention'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeJobError) throw activeJobError;
    if (activeJob) {
      const position = activeJob.status === 'queued'
        ? await caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('created_at', activeJob.created_at)
        : null;
      return NextResponse.json({ id: activeJob.id, status: activeJob.status, reused: true, queuePosition: position?.count || null }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }

    const retryAfter = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: recentFailure, error: recentFailureError } = await caller.admin!.from('exam_generation_jobs')
      .select('id,updated_at,error')
      .eq('tenant_id', caller.profile!.tenant_id)
      .eq('tos_id', tos.id)
      .is('parent_job_id', null)
      .eq('status', 'failed')
      .ilike('error', '%Gemini did not return valid exam questions%')
      .gte('updated_at', retryAfter)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentFailureError) throw recentFailureError;
    if (recentFailure) return NextResponse.json({ error: 'The last generation for this TOS failed. Check the helper status and wait two minutes before retrying; the existing exam was not changed.' }, { status: 429 });

    const { data: helper } = await caller.admin!.from('helper_status').select('state,last_seen_at').order('last_seen_at', { ascending: false }).limit(1).maybeSingle();
    const helperAge = helper?.last_seen_at ? Math.max(0, Math.floor((Date.now() - Date.parse(helper.last_seen_at)) / 1000)) : null;
    const helperAvailable = helperAge !== null && helperAge < 45 && ['idle', 'busy'].includes(helper?.state || '');
    if (!helperAvailable) return NextResponse.json({ error: 'The Gemini helper is unavailable. No job was created. Start the helper and try again.' }, { status: 503 });

    const [tenant, hourly, daily] = await Promise.all([
      caller.admin!.from('tenants').select('ai_hourly_user_limit,ai_daily_school_limit').eq('id', caller.profile!.tenant_id).maybeSingle(),
      caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('created_by', caller.user!.id).neq('status', 'cancelled').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', caller.profile!.tenant_id).neq('status', 'cancelled').gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    ]);
    const userLimit = Number(process.env.AI_HOURLY_USER_LIMIT) || tenant.data?.ai_hourly_user_limit || 5;
    const schoolLimit = Number(process.env.AI_DAILY_SCHOOL_LIMIT) || tenant.data?.ai_daily_school_limit || 100;
    if ((hourly.count || 0) >= userLimit) return NextResponse.json({ error: `Hourly rate limit reached (${userLimit} exam generations per hour). Please wait before generating again.` }, { status: 429 });
    if ((daily.count || 0) >= schoolLimit) return NextResponse.json({ error: `Your school has reached the daily limit of ${schoolLimit} exam generations per day.` }, { status: 429 });

    if (body.repairItemNumber !== undefined && (!Number.isInteger(body.repairItemNumber) || body.repairItemNumber < 1 || body.repairItemNumber > 90)) return NextResponse.json({ error: 'repairItemNumber must be a whole item number from 1 to 90.' }, { status: 400 });

    const rootSlots = buildSlotsFromTos(Array.isArray(tos.rows) ? tos.rows : [], Number(tos.target_items) || 50);
    const slots = Number.isInteger(body.repairItemNumber) ? rootSlots.filter((slot) => slot.item_number === body.repairItemNumber) : rootSlots;
    if (!slots.length || slots.length > 90) return NextResponse.json({ error: 'The TOS must contain between 1 and 90 exam items.' }, { status: 400 });
    const lessonChunks = toLessonChunks(documents);
    if (!lessonChunks.length || lessonChunks.length > 50) return NextResponse.json({ error: 'The lesson materials must contain readable text in no more than 50 sections.' }, { status: 400 });
    const payload: Record<string, any> = { prompt: buildExamPrompt(slots), lessonChunks, slots, competencyIds: [...new Set(slots.map((slot) => slot.competency_id))] };
    if (Number.isInteger(body.repairItemNumber)) {
      if (!rootSlots.some((slot) => slot.item_number === body.repairItemNumber)) return NextResponse.json({ error: 'That question is not part of this TOS.' }, { status: 400 });
      payload.rootSlots = rootSlots;
      payload.partialQuestions = Array.isArray(tos.questions) ? tos.questions.filter((question: any) => Number(question?.item_number) !== body.repairItemNumber) : [];
    }
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 1_572_864) return NextResponse.json({ error: 'The lesson text and exam blueprint exceed the 1.5 MB queue limit. Reduce the material and try again.' }, { status: 413 });
    const job = await getExamAiProvider().enqueue(caller.admin!, { tenantId: caller.profile!.tenant_id, tosId: tos.id, createdBy: caller.user!.id, payload, jobKind: Number.isInteger(body.repairItemNumber) ? 'repair' : 'full' });
    const { count } = await caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('created_at', job.createdAt);
    return NextResponse.json({ id: job.id, status: job.status, reused: job.reused, queuePosition: job.status === 'queued' ? count || 1 : null }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'The request must be valid JSON.' }, { status: 400 });
    console.error('[exam-jobs POST] Could not create a generation job.');
    return NextResponse.json({ error: 'Could not queue exam generation. Please try again.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const caller = await getCaller();
    if (caller.response) return caller.response;
    const params = new URL(request.url).searchParams;
    const tosId = params.get('tosId');
    const tosIds = (params.get('tosIds') || '').split(',').filter(Boolean).slice(0, 100);
    if (!tosId && !tosIds.length) return NextResponse.json({ error: 'tosId or tosIds is required.' }, { status: 400 });
    const admin = caller.admin!;
    await admin.rpc('expire_unserviceable_exam_jobs');
    await admin.rpc('cleanup_exam_job_payloads');
    let query = admin.from('exam_generation_jobs').select('id,tos_id,status,progress,error,result_summary,created_at,updated_at,finished_at,created_by,job_kind,parent_job_id').eq('tenant_id', caller.profile!.tenant_id).order('created_at', { ascending: false });
    if (tosId) query = query.eq('tos_id', tosId).limit(1);
    else query = query.in('tos_id', tosIds);
    const { data: jobs, error } = await query;
    if (error) throw error;
    if (!tosId) {
      const parentIds = [...new Set((jobs || []).map((job: any) => job.parent_job_id).filter(Boolean))];
      const { data: parents } = parentIds.length
        ? await admin.from('exam_generation_jobs').select('id,tos_id,status,progress,error,result_summary,created_at,updated_at,finished_at,created_by').eq('tenant_id', caller.profile!.tenant_id).in('id', parentIds)
        : { data: [] };
      const parentsById = new Map((parents || []).map((parent: any) => [parent.id, parent]));
      const latestByTos: Record<string, any> = {};
      for (const job of jobs || []) if (!latestByTos[job.tos_id]) latestByTos[job.tos_id] = (job.parent_job_id && parentsById.get(job.parent_job_id)) || job;
      return NextResponse.json({ jobsByTosId: latestByTos }, { headers: { 'Cache-Control': 'no-store' } });
    }
    let job: any = jobs?.[0];
    if (!job) return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    if (job.parent_job_id) {
      const { data: parent } = await admin.from('exam_generation_jobs').select('id,tos_id,status,progress,error,result_summary,created_at,updated_at,finished_at,created_by').eq('tenant_id', caller.profile!.tenant_id).eq('id', job.parent_job_id).maybeSingle();
      if (parent) job = parent;
    }
    const position = job.status === 'queued' ? await admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued').lte('created_at', job.created_at) : null;
    return NextResponse.json({ job: { ...job, queuePosition: position?.count || null } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load exam generation status.' }, { status: 503 });
  }
}
