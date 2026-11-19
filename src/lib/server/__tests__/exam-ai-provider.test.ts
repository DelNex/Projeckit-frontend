import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExamQuotaError, GroqExamJobProvider } from '../exam-ai-provider';

function fakeAdmin(result: unknown, error: unknown = null) {
  let received: Record<string, unknown> | null = null;
  return {
    client: { rpc: async (_name: string, args: Record<string, unknown>) => { received = args; return { data: result, error }; } },
    getArgs: () => received,
  };
}

const input = { tenantId: 'tenant-1', tosId: 'tos-1', createdBy: 'teacher-1', payload: { prompt: 'test' }, jobKind: 'full' as const, hourlyLimit: 7, dailyLimit: 42 };

test('passes configured user and school quotas to the atomic database gate', async () => {
  const fake = fakeAdmin([{ job_id: 'job-1', created_at: '2026-11-20T00:00:00Z', status: 'queued', created: true }]);
  const result = await new GroqExamJobProvider().enqueue(fake.client, input);
  assert.deepEqual(fake.getArgs(), { p_tenant_id: input.tenantId, p_tos_id: input.tosId, p_created_by: input.createdBy, p_payload: input.payload, p_job_kind: input.jobKind, p_hourly_limit: 7, p_daily_limit: 42 });
  assert.deepEqual(result, { id: 'job-1', createdAt: '2026-11-20T00:00:00Z', status: 'queued', reused: false });
});

test('maps atomic hourly and daily quota rejections to typed rate-limit errors', async () => {
  for (const [message, limit] of [['EXAM_HOURLY_LIMIT_REACHED', 'hourly'], ['EXAM_DAILY_LIMIT_REACHED', 'daily']] as const) {
    const fake = fakeAdmin(null, { message });
    await assert.rejects(() => new GroqExamJobProvider().enqueue(fake.client, input), (error: unknown) => error instanceof ExamQuotaError && error.limit === limit);
  }
});

test('keeps unrelated database failures distinct from quota rejections', async () => {
  const fake = fakeAdmin(null, { message: 'connection unavailable' });
  await assert.rejects(() => new GroqExamJobProvider().enqueue(fake.client, input), /Could not queue exam generation/);
});
