import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { runNextGroqExamJob } from '@/lib/server/groq-exam-worker';

export const maxDuration = 60;
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildExamPrompt, buildSlotsFromTos, toLessonChunks } from '@/lib/server/exam-jobs';
import { getExamAiProvider } from '@/lib/server/exam-ai-provider';
import { getConfiguredExamProviders } from '@/lib/server/exam-ai-provider-router';
import { logSystemEvent } from '@/lib/server/system-logger';
import { isLessonSourceManifest, type LessonSourceManifest } from '@/lib/lesson-source';
import { deleteCompressedLessonSource, readCompressedLessonDocuments } from '@/lib/server/lesson-source-storage';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: 'Sign in before generating an exam.' }, { status: 401 }) };
  const { data: profile, error } = await supabase.from('profiles').select('id,tenant_id,status,archived_at').eq('id', user.id).maybeSingle();
  if (error || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) return { response: NextResponse.json({ error: 'Your account does not have access to exam generation.' }, { status: 403 }) };
  return { user, profile, admin: createAdminClient() };
}

export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') || request.headers.get('x-nf-request-id') || randomUUID();
  let uploadedSource: { manifest: LessonSourceManifest; ownerId: string } | null = null;
  let cleanupAdmin: any = null;
  let keepUploadedSource = false;

  try {
    const caller = await getCaller();
    if (caller.response) return caller.response;
    cleanupAdmin = caller.admin!;
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 1_450_000) return NextResponse.json({ error: 'The exam request metadata is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as {
      tosId?: string;
      lessonText?: string;
      lessonDocuments?: Array<{ name: string; text: string; competencyId?: string }>;
      sourceManifest?: unknown;
      teacherInstructions?: string;
      repairItemNumber?: number;
    };
    if (!body.tosId) return NextResponse.json({ error: 'Choose a Table of Specifications before generating an exam.' }, { status: 400 });

    const { data: tos, error: tosError } = await caller.admin!.from('tos_documents').select('id,tenant_id,rows,target_items,questions')
      .eq('id', body.tosId).eq('tenant_id', caller.profile!.tenant_id).maybeSingle();
    if (tosError || !tos) return NextResponse.json({ error: 'The Table of Specifications was not found in your school.' }, { status: 404 });

    const teacherInstructions = typeof body.teacherInstructions === 'string' ? body.teacherInstructions.trim() : '';
    if (teacherInstructions.length > 4000) return NextResponse.json({ error: 'Teacher instructions must be 4,000 characters or fewer.' }, { status: 400 });

    let documents: Array<{ name: string; text: string; competencyId?: string }> = [];
    if (body.sourceManifest !== undefined) {
      if (!isLessonSourceManifest(body.sourceManifest, caller.user!.id)) {
        return NextResponse.json({ error: 'The compressed lesson source reference is invalid.' }, { status: 400 });
      }
      uploadedSource = { manifest: body.sourceManifest, ownerId: caller.user!.id };
      documents = await readCompressedLessonDocuments(caller.admin!, body.sourceManifest, caller.user!.id);
    } else {
      documents = Array.isArray(body.lessonDocuments) ? body.lessonDocuments
        : body.lessonText?.trim() ? [{ name: 'Lesson materials', text: body.lessonText }] : [];
    }

    if (!documents.length || documents.some((doc) => !doc || typeof doc.name !== 'string' || typeof doc.text !== 'string'
      || (doc.competencyId !== undefined && typeof doc.competencyId !== 'string'))) {
      return NextResponse.json({ error: 'Upload or extract lesson text before generating an exam.' }, { status: 400 });
    }
    if (documents.reduce((sum, doc) => sum + doc.text.length, 0) > 900_000) {
      return NextResponse.json({ error: 'These lessons contain more than 900,000 characters for one generation job. Split the material into smaller uploads or generate a smaller exam.' }, { status: 413 });
    }

    const { data: activeJob, error: activeJobError } = await caller.admin!.from('exam_generation_jobs')
      .select('id,status,created_at,provider,payload').eq('tenant_id', caller.profile!.tenant_id).eq('tos_id', tos.id)
      .eq('provider', 'groq_api').is('parent_job_id', null).in('status', ['queued', 'running', 'needs_attention'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (activeJobError) throw activeJobError;
    if (activeJob) {
      const existingPath = activeJob.payload?.sourceManifest?.storagePath;
      if (uploadedSource && existingPath === uploadedSource.manifest.storagePath) keepUploadedSource = true;
      if (activeJob.provider === 'groq_api' && ['queued', 'needs_attention'].includes(activeJob.status)) {
        after(async () => {
          try { await runNextGroqExamJob(caller.admin!); }
          catch (error) { console.error('[Groq worker] Existing job processing failed:', error instanceof Error ? error.message : 'unknown error'); }
        });
      }
      const position = activeJob.status === 'queued'
        ? await caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true })
          .eq('provider', 'groq_api').eq('status', 'queued').lte('created_at', activeJob.created_at)
        : null;
      return NextResponse.json({ id: activeJob.id, status: activeJob.status, reused: true, queuePosition: position?.count || null }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }

    const retryAfter = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: recentFailure, error: recentFailureError } = await caller.admin!.from('exam_generation_jobs')
      .select('id,updated_at,error').eq('tenant_id', caller.profile!.tenant_id).eq('tos_id', tos.id)
      .is('parent_job_id', null).eq('status', 'failed').gte('updated_at', retryAfter)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (recentFailureError) throw recentFailureError;
    if (recentFailure) return NextResponse.json({ error: 'The last AI generation for this TOS failed. Check the error and wait two minutes before retrying; the existing exam was not changed.' }, { status: 429 });
    if (!getConfiguredExamProviders().length) return NextResponse.json({ error: 'No exam AI provider is configured. Add at least one server-side provider key.' }, { status: 503 });

    const [tenant, hourly, daily] = await Promise.all([
      caller.admin!.from('tenants').select('ai_hourly_user_limit,ai_daily_school_limit').eq('id', caller.profile!.tenant_id).maybeSingle(),
      caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('created_by', caller.user!.id)
        .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', caller.profile!.tenant_id)
        .neq('status', 'cancelled').or('status.neq.failed,attempts.gt.0').gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    ]);
    const userLimit = Number(process.env.AI_HOURLY_USER_LIMIT) || tenant.data?.ai_hourly_user_limit || 5;
    const schoolLimit = Number(process.env.AI_DAILY_SCHOOL_LIMIT) || tenant.data?.ai_daily_school_limit || 100;
    if ((hourly.count || 0) >= userLimit) return NextResponse.json({ error: 'Hourly rate limit reached (' + userLimit + ' exam generations per hour). Please wait before generating again.' }, { status: 429 });
    if ((daily.count || 0) >= schoolLimit) return NextResponse.json({ error: 'Your school has reached the daily limit of ' + schoolLimit + ' exam generations per day.' }, { status: 429 });

    if (body.repairItemNumber !== undefined && (!Number.isInteger(body.repairItemNumber) || body.repairItemNumber < 1 || body.repairItemNumber > 90)) {
      return NextResponse.json({ error: 'repairItemNumber must be a whole item number from 1 to 90.' }, { status: 400 });
    }
    const rootSlots = buildSlotsFromTos(Array.isArray(tos.rows) ? tos.rows : [], Number(tos.target_items) || 50);
    const slots = Number.isInteger(body.repairItemNumber) ? rootSlots.filter((slot) => slot.item_number === body.repairItemNumber) : rootSlots;
    if (!slots.length || slots.length > 90) return NextResponse.json({ error: 'The TOS must contain between 1 and 90 exam items.' }, { status: 400 });

    const lessonChunks = toLessonChunks(documents);
    if (!lessonChunks.length || lessonChunks.length > 50) return NextResponse.json({ error: 'The lesson materials must contain readable text in no more than 50 sections.' }, { status: 400 });
    const payload: Record<string, any> = {
      prompt: buildExamPrompt(slots),
      ...(uploadedSource ? { sourceManifest: uploadedSource.manifest } : { lessonChunks }),
      slots,
      competencyIds: [...new Set(slots.map((slot) => slot.competency_id))],
      ...(teacherInstructions ? { teacherInstructions } : {}),
    };
    if (Number.isInteger(body.repairItemNumber)) {
      if (!rootSlots.some((slot) => slot.item_number === body.repairItemNumber)) return NextResponse.json({ error: 'That question is not part of this TOS.' }, { status: 400 });
      payload.rootSlots = rootSlots;
      payload.partialQuestions = Array.isArray(tos.questions) ? tos.questions.filter((question: any) => Number(question?.item_number) !== body.repairItemNumber) : [];
    }
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 1_572_864) return NextResponse.json({ error: 'The exam blueprint exceeds the 1.5 MB queue limit. Reduce the TOS and try again.' }, { status: 413 });

    const job = await getExamAiProvider().enqueue(caller.admin!, {
      tenantId: caller.profile!.tenant_id, tosId: tos.id, createdBy: caller.user!.id, payload,
      jobKind: Number.isInteger(body.repairItemNumber) ? 'repair' : 'full',
    });
    if (!job.reused) keepUploadedSource = Boolean(uploadedSource);
    if (job.reused && uploadedSource) {
      const { data: existing } = await caller.admin!.from('exam_generation_jobs').select('payload').eq('id', job.id).maybeSingle();
      keepUploadedSource = existing?.payload?.sourceManifest?.storagePath === uploadedSource.manifest.storagePath;
    }

    if (!job.reused && ['queued', 'needs_attention'].includes(job.status)) {
      after(async () => {
        try { await runNextGroqExamJob(caller.admin!); }
        catch (error) { console.error('[Groq worker] Exam job failed:', error instanceof Error ? error.message : 'unknown error'); }
      });
    }
    const { count } = await caller.admin!.from('exam_generation_jobs').select('id', { count: 'exact', head: true })
      .eq('provider', 'groq_api').eq('status', 'queued').lte('created_at', job.createdAt);
    return NextResponse.json({ id: job.id, status: job.status, reused: job.reused, queuePosition: job.status === 'queued' ? count || 1 : null }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'The request must be valid JSON.', requestId }, { status: 400 });
    await logSystemEvent({
      severity: 'error', source: 'exam.jobs.create', code: 'EXAM_JOB_CREATE_FAILED',
      message: error instanceof Error ? error.message : 'Unknown exam job creation error',
      method: 'POST', route: '/api/ai/exam-jobs', requestId,
    });
    return NextResponse.json({ error: 'Could not queue exam generation. Please try again.', requestId }, { status: 500 });
  } finally {
    if (uploadedSource && !keepUploadedSource && cleanupAdmin) {
      await deleteCompressedLessonSource(cleanupAdmin, uploadedSource.manifest, uploadedSource.ownerId).catch(() => undefined);
    }
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
    let query = admin.from('exam_generation_jobs').select('id,tos_id,status,provider,progress,error,result_summary,created_at,updated_at,finished_at,created_by,job_kind,parent_job_id').eq('tenant_id', caller.profile!.tenant_id).eq('provider', 'groq_api').order('created_at', { ascending: false });
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
      const { data: parent } = await admin.from('exam_generation_jobs').select('id,tos_id,status,progress,error,result_summary,created_at,updated_at,finished_at,created_by').eq('tenant_id', caller.profile!.tenant_id).eq('provider', 'groq_api').eq('id', job.parent_job_id).maybeSingle();
      if (parent) job = parent;
    }
    const position = job.status === 'queued' ? await admin.from('exam_generation_jobs').select('id', { count: 'exact', head: true }).eq('provider', 'groq_api').eq('status', 'queued').lte('created_at', job.created_at) : null;
    return NextResponse.json({ job: { ...job, queuePosition: position?.count || null } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not load exam generation status.' }, { status: 503 });
  }
}
