import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGroqMessages, chooseNextExamJob } from '../groq-exam-worker';
import { getConfiguredExamProviders } from '../exam-ai-provider-router';
import { GroqExamJobProvider } from '../exam-ai-provider';

test('exam context retrieval prefers lesson sections relevant to the requested competency', () => {
  const payload = {
    slots: [{ item_number: 1, competency_id: 'BIO-1', competency_code: 'BIO-1', competency_description: 'Explain photosynthesis in plants', cognitive_level: 'understanding' }],
    lessonChunks: [
      { source: 'Lesson material', part: 1, parts: 10, text: 'The water cycle describes evaporation and precipitation.' },
      { source: 'Lesson material', part: 2, parts: 10, text: 'Photosynthesis converts light energy into chemical energy in green plants.' },
      { source: 'Lesson material', part: 3, parts: 10, text: 'The solar system contains planets, moons, and asteroids.' },
    ],
    prompt: 'Write one question.',
  };
  const messages = buildGroqMessages(payload);
  assert.match(messages[1].content, /Photosynthesis converts light energy/);
  assert.doesNotMatch(messages[1].content, /solar system contains planets/);
  assert.match(messages[1].content, /Source section 2\/10/);
});

test('provider registry exposes only providers with server-side credentials', () => {
  const names = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(getConfiguredExamProviders(), []);
    process.env.AI_PROVIDER_ORDER = 'gemini,groq,openrouter,cloudflare';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.CLOUDFLARE_API_TOKEN = 'test-cloudflare-token';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    assert.deepEqual(getConfiguredExamProviders(), ['gemini', 'groq', 'openrouter', 'cloudflare']);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('falls back from a rate-limited provider and parses the next provider response', async () => {
  const names = ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER_ORDER = 'openrouter,gemini';
    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '60' },
        });
      }
      assert.match(String(_input), /generativelanguage\.googleapis\.com/);
      assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-gemini-key');
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [{ item_number: 1 }] }) }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders(
      [{ role: 'user', content: 'Create one question.' }],
      { type: 'object', properties: { questions: { type: 'array' } } },
    );
    assert.deepEqual(JSON.parse(result), [{ item_number: 1 }]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('queue dispatcher prefers the least-loaded school, then the oldest job', () => {
  const queued = [
    { id: 'a-old', tenant_id: 'school-a', created_at: '2026-01-01T00:00:00Z' },
    { id: 'b-old', tenant_id: 'school-b', created_at: '2026-01-02T00:00:00Z' },
    { id: 'c-new', tenant_id: 'school-c', created_at: '2026-01-03T00:00:00Z' },
    { id: 'a-new', tenant_id: 'school-a', created_at: '2026-01-04T00:00:00Z' },
  ];
  const active = [{ tenant_id: 'school-a' }, { tenant_id: 'school-a' }, { tenant_id: 'school-b' }];
  assert.equal(chooseNextExamJob(queued, active)?.id, 'c-new');
  assert.equal(chooseNextExamJob(queued.slice(1), [{ tenant_id: 'school-b' }])?.id, 'c-new');
  assert.equal(chooseNextExamJob(queued, [{ tenant_id: 'school-a' }, { tenant_id: 'school-a' }, { tenant_id: 'school-b' }, { tenant_id: 'school-b' }, { tenant_id: 'school-c' }, { tenant_id: 'school-c' }]), undefined);
});


test('queue admission sends validated hourly and school quota limits to the atomic RPC', async () => {
  let rpcName = '';
  let rpcArgs: Record<string, unknown> = {};
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcName = name;
      rpcArgs = args;
      return {
        data: [{ job_id: 'job-1', created_at: '2026-11-19T12:00:00Z', status: 'queued', created: true }],
        error: null,
      };
    },
  };
  const result = await new GroqExamJobProvider().enqueue(admin, {
    tenantId: 'tenant-1',
    tosId: 'tos-1',
    createdBy: 'teacher-1',
    payload: { slots: [] },
    jobKind: 'full',
    hourlyLimit: 5,
    dailyLimit: 100,
  });
  assert.equal(rpcName, 'enqueue_groq_exam_generation_job');
  assert.equal(rpcArgs.p_hourly_limit, 5);
  assert.equal(rpcArgs.p_daily_limit, 100);
  assert.equal(result.reused, false);
  assert.equal(result.id, 'job-1');
});
