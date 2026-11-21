import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { authorizeHelperRequest } from '../helper-auth';
import { canCancelExamJob, finalizeExamJob, jobBelongsToTenant, verifySourceEvidence } from '../exam-jobs';

const slots = [
  { item_number: 1, competency_id: 'C1', competency_code: 'C1', competency_description: 'First competency', cognitive_level: 'remembering' as const },
  { item_number: 2, competency_id: 'C2', competency_code: 'C2', competency_description: 'Second competency', cognitive_level: 'understanding' as const },
];
const question = (slot: typeof slots[number]) => ({
  item_number: slot.item_number, competency_id: slot.competency_id, cognitive_level: slot.cognitive_level,
  question: `What is the answer for item ${slot.item_number}?`,
  options: { A: `Answer ${slot.item_number}`, B: `Choice B ${slot.item_number}`, C: `Choice C ${slot.item_number}`, D: `Choice D ${slot.item_number}` },
  correct_answer: 'A', rationale: 'This follows the lesson.',
});

function createAdminMock(job: any) {
  const writes: Array<{ table: string; method: string; value: any }> = [];
  const admin: any = {
    from(table: string) {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.neq = () => chain;
      chain.update = (value: any) => { writes.push({ table, method: 'update', value }); return chain; };
      chain.insert = (value: any) => { writes.push({ table, method: 'insert', value }); return chain; };
      chain.maybeSingle = async () => ({ data: table === 'exam_generation_jobs' ? job : null, error: null });
      chain.single = async () => ({ data: { id: 'repair-child' }, error: null });
      return chain;
    },
    async rpc(name: string, args: any) { writes.push({ table: name, method: 'rpc', value: args }); return { error: null }; },
  };
  return { admin, writes };
}

test('finalizeExamJob is idempotent after completion', async () => {
  const job = { id: 'job-1', status: 'completed', result_summary: { questionCount: 2, questions: [question(slots[0])] } };
  const { admin, writes } = createAdminMock(job);
  const result = await finalizeExamJob('job-1', 'ignored', admin);
  assert.equal(result.status, 'completed');
  assert.equal(writes.length, 0);
});

test('finalizeExamJob queues a repair containing only missing item slots', async () => {
  const job = { id: 'job-2', tenant_id: 'tenant-a', tos_id: 'tos-a', created_by: 'user-a', status: 'running', job_kind: 'full', repair_round: 0, payload: { slots, lessonChunks: [{ source: 'Lesson material', text: 'text' }], prompt: 'write' } };
  const { admin, writes } = createAdminMock(job);
  const result = await finalizeExamJob('job-2', JSON.stringify([question(slots[0])]), admin);
  assert.equal(result.status, 'running');
  const child = writes.find((write) => write.table === 'exam_generation_jobs' && write.method === 'insert')?.value;
  assert.equal(child.job_kind, 'repair');
  assert.deepEqual(child.payload.slots.map((slot: any) => slot.item_number), [2]);
  assert.equal(child.repair_round, 1);
});

test('repair round two saves a partial draft with valid questions only', async () => {
  const job = {
    id: 'job-3', tenant_id: 'tenant-a', tos_id: 'tos-a', created_by: 'user-a', status: 'running', job_kind: 'repair', repair_round: 2,
    payload: { slots: [slots[1]], rootSlots: slots, partialQuestions: [question(slots[0])], prompt: 'repair' },
  };
  const { admin, writes } = createAdminMock(job);
  const badQuestion = { ...question(slots[1]), options: { A: 'same', B: 'same', C: 'same', D: 'same' } };
  const result = await finalizeExamJob('job-3', JSON.stringify([badQuestion]), admin);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.missingItems, [2]);
  const save = writes.find((write) => write.method === 'rpc');
  assert.ok(save);
  assert.equal(save.table, 'finalize_exam_generation_job');
  assert.equal(save.value.p_job_id, 'job-3');
  assert.equal(save.value.p_root_job_id, 'job-3');
  assert.equal(save.value.p_job_status, 'partial');
  assert.equal(save.value.p_questions.length, 1);
  assert.equal(save.value.p_questions[0].item_number, 1);
});

test('sparse repair slot numbers are checked against TOS slots, not a 1-based range', async () => {
  const lateSlot = { ...slots[1], item_number: 25 };
  const job = {
    id: 'job-sparse', tenant_id: 'tenant-a', tos_id: 'tos-a', created_by: 'user-a', status: 'running', job_kind: 'repair', repair_round: 1,
    payload: { slots: [lateSlot], rootSlots: [slots[0], lateSlot], partialQuestions: [question(slots[0])], prompt: 'repair' },
  };
  const { admin, writes } = createAdminMock(job);
  const result = await finalizeExamJob('job-sparse', JSON.stringify([question(lateSlot)]), admin);
  assert.equal(result.status, 'completed');
  const save = writes.find((write) => write.method === 'rpc');
  assert.equal(save?.table, 'finalize_exam_generation_job');
  assert.deepEqual(save?.value.p_questions.map((item: any) => item.item_number), [1, 25]);
});

test('duplicate item numbers are repaired instead of being accepted', async () => {
  const job = { id: 'job-duplicate', tenant_id: 'tenant-a', tos_id: 'tos-a', created_by: 'user-a', status: 'running', job_kind: 'full', repair_round: 0, payload: { slots, prompt: 'write' } };
  const { admin, writes } = createAdminMock(job);
  const result = await finalizeExamJob('job-duplicate', JSON.stringify([question(slots[0]), question(slots[0]), question(slots[1])]), admin);
  assert.equal(result.status, 'running');
  const child = writes.find((write) => write.table === 'exam_generation_jobs' && write.method === 'insert')?.value;
  assert.deepEqual(child.payload.slots.map((slot: any) => slot.item_number), [1]);
});

test('failed generation does not call the atomic question-save operation', async () => {
  const job = { id: 'job-4', tenant_id: 'tenant-a', tos_id: 'tos-a', created_by: 'user-a', status: 'running', job_kind: 'full', repair_round: 2, payload: { slots: [slots[0]], prompt: 'write' } };
  const { admin, writes } = createAdminMock(job);
  const result = await finalizeExamJob('job-4', 'not a question array', admin);
  assert.equal(result.status, 'failed');
  assert.equal(writes.some((write) => write.method === 'rpc'), false);
});


test('source evidence must quote the exact supplied source section', () => {
  const chunks = [{
    source: 'Lesson material',
    sourceId: 'source-1',
    part: 2,
    parts: 3,
    text: 'Photosynthesis converts sunlight into chemical energy in green plants.',
  }];
  assert.equal(verifySourceEvidence({
    source_id: 'source-1', part: 2, quote: 'converts sunlight into chemical energy',
  }, chunks), true);
  assert.equal(verifySourceEvidence({
    source_id: 'source-1', part: 2, quote: 'plants convert water into glucose',
  }, chunks), false);
  assert.equal(verifySourceEvidence({
    source_id: 'source-2', part: 2, quote: 'converts sunlight into chemical energy',
  }, chunks), false);
  assert.equal(verifySourceEvidence({
    source_id: 'source-1', part: 3, quote: 'converts sunlight into chemical energy',
  }, chunks), false);
});

test('finalizer queues repair when a new question has unsupported source evidence', async () => {
  const sourceChunks = [{
    source: 'Lesson material', sourceId: 'source-1', part: 1, parts: 1,
    text: 'Photosynthesis converts light energy into chemical energy.',
  }];
  const job = {
    id: 'job-evidence', tenant_id: 'tenant-a', tos_id: 'tos-a', created_by: 'user-a',
    status: 'running', job_kind: 'full', repair_round: 0,
    payload: { slots, requireEvidence: true, lessonChunks: sourceChunks, prompt: 'write' },
  };
  const { admin, writes } = createAdminMock(job);
  const valid = {
    ...question(slots[0]),
    source_evidence: { source_id: 'source-1', part: 1, quote: 'converts light energy into chemical energy' },
  };
  const unsupported = {
    ...question(slots[1]),
    source_evidence: { source_id: 'source-1', part: 1, quote: 'plants absorb blue light to make proteins' },
  };
  const result = await finalizeExamJob('job-evidence', JSON.stringify([valid, unsupported]), admin, sourceChunks);
  assert.equal(result.status, 'running');
  assert.deepEqual(result.missingItems, [2]);
  const child = writes.find((write) => write.table === 'exam_generation_jobs' && write.method === 'insert')?.value;
  assert.deepEqual(child.payload.slots.map((slot: any) => slot.item_number), [2]);
  assert.equal(child.payload.partialQuestions[0].source_evidence.quote, valid.source_evidence.quote);
});

test('helper routes reject missing and incorrect bearer tokens', () => {
  const old = process.env.GEMINI_HELPER_TOKEN;
  process.env.GEMINI_HELPER_TOKEN = 'x'.repeat(64);
  try {
    assert.equal(authorizeHelperRequest(new Request('http://localhost/api/helper/claim'))?.status, 401);
    assert.equal(authorizeHelperRequest(new Request('http://localhost/api/helper/claim', { headers: { authorization: `Bearer ${'y'.repeat(64)}` } }))?.status, 401);
  } finally {
    if (old === undefined) delete process.env.GEMINI_HELPER_TOKEN;
    else process.env.GEMINI_HELPER_TOKEN = old;
  }
});

test('job tenant check prevents a tenant from reading another school job', () => {
  assert.equal(jobBelongsToTenant({ tenant_id: 'tenant-a' }, 'tenant-a'), true);
  assert.equal(jobBelongsToTenant({ tenant_id: 'tenant-b' }, 'tenant-a'), false);
});

test('only the job creator or a school/platform administrator can cancel a job', () => {
  const job = { created_by: 'teacher-a' };
  assert.equal(canCancelExamJob(job, { id: 'teacher-a', role: 'Teacher' }), true);
  assert.equal(canCancelExamJob(job, { id: 'teacher-b', role: 'Teacher' }), false);
  assert.equal(canCancelExamJob(job, { id: 'teacher-b', role: 'admin' }), true);
  assert.equal(canCancelExamJob(job, { id: 'teacher-b', role: 'Administrator' }), true);
  assert.equal(canCancelExamJob(job, { id: 'teacher-b', role: 'admin', is_platform_admin: true }), true);
  assert.equal(canCancelExamJob(job, { id: 'teacher-b', role: 'Teacher', is_platform_admin: true }), false);
  assert.equal(canCancelExamJob(null, { id: 'teacher-a', role: 'Teacher' }), false);
});

test('claim function uses row locking, leases, retries and tenant concurrency limits', async () => {
  const migration = await readFile(new URL('../../../../supabase/migrations/20261119115522_multi_provider_exam_dispatch_limits.sql', import.meta.url), 'utf8');
  assert.match(migration, /FOR UPDATE SKIP LOCKED/i);
  assert.match(migration, /lease_expires_at is not null and lease_expires_at <= now\(\)/i);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /global_active >= 4/);
  assert.match(migration, /tenant_active >= 2/);
  assert.match(migration, /attempts = attempts \+ 1/);
});


test('atomic cancellation locks the root and cancels active repair children in one transaction', async () => {
  const migration = await readFile(new URL('../../../../supabase/migrations/20261121120000_atomic_exam_job_cancellation.sql', import.meta.url), 'utf8');
  assert.match(migration, /WHERE id = p_job_id[\s\S]*?FOR UPDATE/i);
  assert.match(migration, /parent_job_id = p_job_id[\s\S]*?status IN \('queued', 'running', 'needs_attention'\)/i);
  assert.match(migration, /RETURNS boolean/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.cancel_exam_generation_job\(uuid, uuid\)[\s\S]*?GRANT EXECUTE[\s\S]*?TO service_role/i);
});

test('exam job route delegates cancellation to the atomic tenant-scoped RPC', async () => {
  const route = await readFile(new URL('../../../app/api/ai/exam-jobs/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /admin\.rpc\('cancel_exam_generation_job'/);
  assert.match(route, /p_tenant_id: job\.tenant_id/);
  assert.match(route, /cancelled !== true/);
  assert.doesNotMatch(route, /\.update\(\{ status: 'cancelled'[\s\S]*?parent_job_id/);
});

test('platform administrators can access jobs without a tenant while tenant users remain scoped', async () => {
  const route = await readFile(new URL('../../../app/api/ai/exam-jobs/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /const isPlatformAdmin = profile\?\.is_platform_admin === true && profile\.role === 'admin'/);
  assert.match(route, /if \(!isPlatformAdmin\) jobQuery = jobQuery\.eq\('tenant_id', profile\.tenant_id\)/);
  assert.match(route, /!profile\.tenant_id && !isPlatformAdmin/);
});
