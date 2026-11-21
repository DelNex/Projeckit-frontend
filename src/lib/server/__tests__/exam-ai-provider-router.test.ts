import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGroqMessages, chooseNextExamJob, getExamProviderRetryDelayMs } from '../groq-exam-worker';
import { buildExamPrompt } from '../exam-jobs';
import { getConfiguredExamProviders, resetExamProviderCooldownsForTests } from '../exam-ai-provider-router';

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
  assert.match(messages[1].content, /Source ID source-2; section 2\/10/);
});

test('exam prompt matches the strict provider schema object wrapper', () => {
  const prompt = buildExamPrompt([{
    item_number: 1,
    competency_id: 'BIO-1',
    competency_code: 'BIO-1',
    competency_description: 'Explain photosynthesis',
    cognitive_level: 'understanding',
  }]);
  assert.match(prompt, /valid JSON object with a top-level "questions" array/);
  assert.match(prompt, /"questions":\[\{"item_number":1/);
  assert.doesNotMatch(prompt, /valid JSON array/);
});

test('provider registry exposes only providers with server-side credentials', () => {
  const names = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(getConfiguredExamProviders(), []);
    process.env.AI_PROVIDER_ORDER = 'toString,gemini,groq,openrouter,cloudflare';
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


test('Gemini receives the same strict JSON schema as the other providers', async () => {
  const names = ['GEMINI_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const schema = { type: 'object', properties: { questions: { type: 'array' } }, required: ['questions'] };
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER_ORDER = 'gemini';
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.match(String(input), /generativelanguage\.googleapis\.com/);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [{ item_number: 1 }] }) }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one item.' }], schema);
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

test('Groq adapter uses the configured chat endpoint and parses structured question JSON', async () => {
  const names = ['GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_SERVICE_TIER', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
    process.env.GROQ_SERVICE_TIER = 'auto';
    process.env.AI_PROVIDER_ORDER = 'groq';
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-groq-key');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'openai/gpt-oss-120b');
      assert.equal(body.response_format.type, 'json_object');
      assert.equal(body.service_tier, undefined);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ questions: [{ item_number: 1 }] }) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one item.' }], { type: 'object' });
    assert.deepEqual(JSON.parse(result), [{ item_number: 1 }]);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Cloudflare adapter preserves the model path and parses Workers AI response output', async () => {
  const names = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_MODEL', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.CLOUDFLARE_API_TOKEN = 'test-cloudflare-token';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
    process.env.AI_PROVIDER_ORDER = 'cloudflare';
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/meta/llama-3.1-8b-instruct');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-cloudflare-token');
      const body = JSON.parse(String(init?.body));
      assert.ok(Array.isArray(body.messages));
      assert.equal(body.response_format.type, 'json_schema');
      assert.deepEqual(body.response_format.json_schema, { type: 'object' });
      return new Response(JSON.stringify({
        success: true,
        result: { response: JSON.stringify({ questions: [{ item_number: 2 }] }) },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one item.' }], { type: 'object' });
    assert.deepEqual(JSON.parse(result), [{ item_number: 2 }]);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Groq 429 preserves Retry-After metadata for the durable worker retry', async () => {
  const names = ['GROQ_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.AI_PROVIDER_ORDER = 'groq';
    global.fetch = (async () => new Response(JSON.stringify({
      error: { message: 'Rate limit reached for tokens per minute' },
    }), {
      status: 429,
      headers: {
        'content-type': 'application/json', 'retry-after': '12',
        'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-reset-tokens': '8s',
      },
    })) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    await assert.rejects(
      requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one question.' }], { type: 'object' }),
      (error: any) => error.status === 429 && error.retryable === true && error.retryAfterMs === 12_000
        && error.rateLimit?.limitTokens === '8000' && error.rateLimit?.remainingTokens === '0'
        && error.rateLimit?.resetTokens === '8s',
    );
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Groq retry delay respects Retry-After and applies bounded exponential backoff', () => {
  assert.equal(getExamProviderRetryDelayMs(12_000, 1), 12_000);
  assert.equal(getExamProviderRetryDelayMs(null, 1), 5_000);
  assert.equal(getExamProviderRetryDelayMs(null, 2), 15_000);
  assert.equal(getExamProviderRetryDelayMs(null, 3), 30_000);
  assert.equal(getExamProviderRetryDelayMs(60 * 60_000, 1), 15 * 60_000);
});


test('OpenRouter adapter sends the OpenAI-compatible structured-output request', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const schema = { type: 'object', properties: { questions: { type: 'array' } }, required: ['questions'] };
  try {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.OPENROUTER_MODEL = 'openrouter/free';
    process.env.AI_PROVIDER_ORDER = 'openrouter';
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://openrouter.ai/api/v1/chat/completions');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer test-openrouter-key');
      assert.equal(headers.get('http-referer'), 'https://projectkit.app');
      assert.equal(headers.get('x-title'), 'Project KIT');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'openrouter/free');
      assert.equal(body.max_tokens, 8192);
      assert.equal(body.max_completion_tokens, undefined);
      assert.deepEqual(body.provider, { require_parameters: true });
      assert.deepEqual(body.reasoning, { effort: 'low' });
      assert.equal(body.response_format.type, 'json_schema');
      assert.deepEqual(body.response_format.json_schema.schema, schema);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ questions: [{ item_number: 3 }] }) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one item.' }], schema);
    assert.deepEqual(JSON.parse(result), [{ item_number: 3 }]);
  } finally {
    global.fetch = originalFetch;
    resetExamProviderCooldownsForTests();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('provider router continues to Gemini when OpenRouter rejects a model-specific request', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'GEMINI_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.OPENROUTER_MODEL = 'openrouter/free';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER_ORDER = 'openrouter,gemini';
    global.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(String(input), 'https://openrouter.ai/api/v1/chat/completions');
        return new Response(JSON.stringify({ error: { message: 'Selected model does not support this schema.' } }), {
          status: 400, headers: { 'content-type': 'application/json' },
        });
      }
      assert.match(String(input), /generativelanguage\.googleapis\.com/);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [{ item_number: 4 }] }) }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one item.' }], { type: 'object' });
    assert.deepEqual(JSON.parse(result), [{ item_number: 4 }]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('OpenRouter empty content falls through to Gemini instead of stalling the job', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER_ORDER = 'openrouter,gemini';
    global.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      if (String(input).includes('openrouter.ai')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '```json\n{"questions":[{"item_number":7}]}\n```' }] } }],
      }), { status: 200 });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one question.' }], { type: 'object' });
    assert.deepEqual(JSON.parse(result), [{ item_number: 7 }]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
    resetExamProviderCooldownsForTests();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Groq HTTP 400 immediately tries the next configured provider', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.AI_PROVIDER_ORDER = 'groq,openrouter';
    global.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      if (String(input).includes('api.groq.com')) {
        return new Response(JSON.stringify({ error: { message: 'Unsupported service tier' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"questions":[{"item_number":8}]}' } }] }), { status: 200 });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one question.' }], { type: 'object' });
    assert.deepEqual(JSON.parse(result), [{ item_number: 8 }]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
    resetExamProviderCooldownsForTests();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('OpenRouter truncated JSON falls through to Gemini instead of failing the exam batch', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER_ORDER = 'openrouter,gemini';
    global.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      if (String(input).includes('openrouter.ai')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"questions":[{"item_number":9}' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"questions":[{"item_number":9}]}' }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    const result = await requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one question.' }], { type: 'object' });
    assert.deepEqual(JSON.parse(result), [{ item_number: 9 }]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
    resetExamProviderCooldownsForTests();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('401 and 403 provider failures use a short credential cooldown', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['GROQ_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.AI_PROVIDER_ORDER = 'groq';
    global.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: 'invalid API key' } }), { status: 401 });
    }) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    await assert.rejects(requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one.' }], { type: 'object' }));
    await assert.rejects(requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one.' }], { type: 'object' }));
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
    resetExamProviderCooldownsForTests();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});


test('Gemini 503 preserves a provider Retry-After header for the queued retry', async () => {
  resetExamProviderCooldownsForTests();
  const names = ['GEMINI_API_KEY', 'AI_PROVIDER_ORDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER_ORDER = 'gemini';
    global.fetch = (async () => new Response(JSON.stringify({ error: { message: 'model overloaded' } }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '10' },
    })) as typeof fetch;
    const { requestExamQuestionsFromProviders } = await import('../exam-ai-provider-router');
    await assert.rejects(
      requestExamQuestionsFromProviders([{ role: 'user', content: 'Create one question.' }], { type: 'object' }),
      (error: any) => error.status === 503 && error.retryable === true && error.retryAfterMs === 10_000,
    );
  } finally {
    global.fetch = originalFetch;
    resetExamProviderCooldownsForTests();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
