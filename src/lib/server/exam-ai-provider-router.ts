import { logSystemEvent } from './system-logger';

type ProviderId = 'groq' | 'openrouter' | 'gemini' | 'cloudflare';

type ProviderConfig = {
  id: ProviderId;
  model: string;
  key: string;
};

const cooldownUntil = new Map<ProviderId, number>();

function providerConfigs(): ProviderConfig[] {
  const env: Record<ProviderId, ProviderConfig | null> = {
    groq: process.env.GROQ_API_KEY ? { id: 'groq', key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b' } : null,
    openrouter: process.env.OPENROUTER_API_KEY ? { id: 'openrouter', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free' } : null,
    gemini: process.env.GEMINI_API_KEY ? { id: 'gemini', key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' } : null,
    cloudflare: process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
      ? { id: 'cloudflare', key: process.env.CLOUDFLARE_API_TOKEN, model: process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct' }
      : null,
  };
  const requested = (process.env.AI_PROVIDER_ORDER || 'groq,openrouter,gemini,cloudflare')
    .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean) as ProviderId[];
  const allowed = new Set<ProviderId>(['groq', 'openrouter', 'gemini', 'cloudflare']);
  const order = [...new Set(requested.filter((id): id is ProviderId => allowed.has(id)))];
  return order.map((id) => env[id]).filter((item): item is ProviderConfig => Boolean(item));
}

export function getConfiguredExamProviders(): ProviderId[] {
  return providerConfigs().map((provider) => provider.id);
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1_000, Math.min(seconds * 1000, 15 * 60_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1_000, Math.min(date - Date.now(), 15 * 60_000)) : 60_000;
}

function parseQuestionContent(raw: unknown): string {
  let text = '';
  if (typeof raw === 'string') text = raw;
  else if (raw && typeof raw === 'object') text = JSON.stringify(raw);
  text = text.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/i, '');
  const parsed = JSON.parse(text);
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(questions) || !questions.length) throw new Error('Provider returned no questions.');
  return JSON.stringify(questions);
}

async function readProviderResponse(response: Response, provider: ProviderId): Promise<string> {
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      cooldownUntil.set(provider, Date.now() + parseRetryAfter(response.headers.get('retry-after')));
    }
    const detail = String(body?.error?.message || body?.message || body?.errors?.[0]?.message || 'Provider request failed').slice(0, 180);
    throw Object.assign(new Error(`${provider} returned HTTP ${response.status}: ${detail}`), {
      status: response.status,
      retryable: response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404 || response.status === 408 || response.status === 409 || response.status === 422 || response.status === 429 || response.status >= 500,
    });
  }

  let content: unknown;
  if (provider === 'gemini') {
    content = body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('');
    if (!content && body?.promptFeedback?.blockReason) throw new Error('Gemini blocked this request.');
  } else if (provider === 'cloudflare') {
    content = body?.result?.response ?? body?.result?.output ?? body?.response;
  } else {
    content = body?.choices?.[0]?.message?.content;
  }
  if (Array.isArray(content)) content = content.map((part: any) => part.text || '').join('');
  if (content && typeof content === 'object' && !Array.isArray(content)) content = JSON.stringify(content);
  return parseQuestionContent(content);
}

async function requestProvider(provider: ProviderConfig, messages: Array<{ role: string; content: string }>, schema: Record<string, unknown>, timeoutMs: number): Promise<string> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  if (provider.id === 'gemini') {
    const system = messages.find((message) => message.role === 'system')?.content || '';
    const user = messages.filter((message) => message.role !== 'system').map((message) => message.content).join('\n\n');
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2, maxOutputTokens: 8192 },
      }),
      signal: timeout, cache: 'no-store',
    });
  } else if (provider.id === 'cloudflare') {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${provider.model.split('/').map((part) => encodeURIComponent(part).replace(/%40/gi, '@')).join('/')}`, {
      method: 'POST', headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: 8192, temperature: 0.2, response_format: { type: 'json_schema', json_schema: schema } }),
      signal: timeout, cache: 'no-store',
    });
  } else {
    const isGroq = provider.id === 'groq';
    response = await fetch(isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json',
        ...(provider.id === 'openrouter' ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://projectkit.app', 'X-Title': 'Project KIT' } : {}),
      },
      body: JSON.stringify({
        model: provider.model, messages, temperature: 0.2, max_completion_tokens: 8192,
        response_format: { type: 'json_schema', json_schema: { name: 'project_kit_exam_questions', strict: true, schema } },
      }),
      signal: timeout, cache: 'no-store',
    });
  }
  return readProviderResponse(response, provider.id);
}

/** Uses only explicitly configured provider credentials; never rotates identities or bypasses provider quotas. */
export async function requestExamQuestionsFromProviders(
  messages: Array<{ role: string; content: string }>,
  schema: Record<string, unknown>,
  jobDeadline?: number,
): Promise<string> {
  const providers = providerConfigs();
  if (!providers.length) throw new Error('No exam AI provider is configured. Add at least one server-side provider API key.');
  const failures: string[] = [];
  // The caller is a 60-second Next.js route. Keep provider failover inside a
  // 50-second budget so the job lease can be renewed/finalized safely.
  const totalSetting = Number(process.env.AI_PROVIDER_TOTAL_TIMEOUT_MS || 50_000);
  const providerSetting = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 18_000);
  const totalBudgetMs = Number.isFinite(totalSetting) ? Math.max(10_000, Math.min(totalSetting, 50_000)) : 50_000;
  const providerTimeoutMs = Number.isFinite(providerSetting) ? Math.max(3_000, Math.min(providerSetting, 25_000)) : 18_000;
  const deadline = Math.min(jobDeadline ?? Number.POSITIVE_INFINITY, Date.now() + totalBudgetMs);
  for (const provider of providers) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 2_000) {
      failures.push('Provider failover time budget expired');
      break;
    }
    const cooldown = cooldownUntil.get(provider.id) || 0;
    if (cooldown > Date.now()) {
      failures.push(`${provider.id} is rate-limited until its cooldown expires`);
      continue;
    }
    try {
      return await requestProvider(provider, messages, schema, Math.min(providerTimeoutMs, remainingMs - 1_000));
    } catch (error) {
      const message = error instanceof Error ? error.message : `${provider.id} request failed`;
      const status = Number((error as Error & { status?: number }).status) || null;
      const retryable = Boolean((error as Error & { retryable?: boolean }).retryable)
        || error instanceof SyntaxError
        || /timeout|fetch failed|network|returned no questions/i.test(message);
      failures.push(`${provider.id}${status ? ` HTTP ${status}` : ''}: ${retryable ? 'retryable failure' : 'non-retryable failure'}`);
      await logSystemEvent({
        severity: retryable ? 'warn' : 'error', source: 'exam.provider-router',
        code: status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : status ? 'AI_PROVIDER_HTTP_ERROR' : 'AI_PROVIDER_REQUEST_FAILED',
        message: 'An AI provider could not complete an exam batch.',
        metadata: { provider: provider.id, status, retryable, attempt: failures.length },
      });
      if (!retryable) break;
    }
  }
  throw new Error(`No configured AI provider could complete this batch. ${failures.join(' | ').slice(0, 700)}`);
}
