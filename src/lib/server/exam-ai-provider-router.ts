import { logSystemEvent } from './system-logger';

type ProviderId = 'groq' | 'openrouter' | 'gemini' | 'cloudflare';

type ProviderConfig = {
  id: ProviderId;
  model: string;
  key: string;
};

const cooldownUntil = new Map<ProviderId, number>();

/** Skip providers with broken credentials briefly instead of paying for repeated 401/403 requests. */
const AUTH_COOLDOWN_MS = 60_000;

/** Clears process-local cooldown state for isolated adapter tests. */
export function resetExamProviderCooldownsForTests(): void {
  cooldownUntil.clear();
}

/** HTTP 400-class request errors need correction, not an immediate retry against the same provider. */
export function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** Divide the remaining job budget between providers that have not been tried yet. */
export function computeAttemptTimeoutMs(perProviderTimeoutMs: number, remainingBudgetMs: number, remainingProviders: number): number {
  const share = Math.floor(remainingBudgetMs / Math.max(1, remainingProviders));
  return Math.max(2_000, Math.min(perProviderTimeoutMs, share) - 1_000);
}

function providerConfigs(): ProviderConfig[] {
  const env: Record<ProviderId, ProviderConfig | null> = {
    groq: process.env.GROQ_API_KEY ? { id: 'groq', key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b' } : null,
    openrouter: process.env.OPENROUTER_API_KEY ? { id: 'openrouter', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/free' } : null,
    gemini: process.env.GEMINI_API_KEY ? { id: 'gemini', key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.8-flash' } : null,
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

function extractJsonText(raw: string): string {
  const text = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/i, '').trim();
  if (text.startsWith('{') || text.startsWith('[')) return text;
  const start = text.search(/[\[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function parseQuestionContent(raw: unknown): string {
  let text = '';
  if (typeof raw === 'string') text = raw;
  else if (raw && typeof raw === 'object') text = JSON.stringify(raw);
  if (!text.trim()) throw new Error('Provider returned an empty response body.');
  const parsed = JSON.parse(extractJsonText(text));
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(questions) || !questions.length) throw new Error('Provider returned no questions.');
  return JSON.stringify(questions);
}

async function readProviderResponse(response: Response, provider: ProviderId): Promise<string> {
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      cooldownUntil.set(provider, Date.now() + retryAfterMs);
    } else if (response.status === 401 || response.status === 403) {
      cooldownUntil.set(provider, Date.now() + AUTH_COOLDOWN_MS);
    }
    const detail = String(body?.error?.message || body?.message || body?.errors?.[0]?.message || 'Provider request failed').slice(0, 180);
    const providerErrorCode = body?.error?.code || body?.error?.type || body?.code || null;
    const hasFailedGeneration = Boolean(body?.error?.failed_generation || body?.failed_generation);
    const providerRequestId = response.headers.get('x-request-id') || response.headers.get('x-openrouter-generation-id') || response.headers.get('cf-ray');
    const rateLimit = response.status === 429 ? {
      limitTokens: response.headers.get('x-ratelimit-limit-tokens'),
      remainingTokens: response.headers.get('x-ratelimit-remaining-tokens'),
      resetTokens: response.headers.get('x-ratelimit-reset-tokens'),
      retryAfter: response.headers.get('retry-after'),
    } : null;
    throw Object.assign(new Error(`${provider} returned HTTP ${response.status}: ${detail}`), {
      status: response.status,
      retryable: isRetryableProviderStatus(response.status),
      retryAfterMs: response.status === 429 || (response.status >= 500 && response.headers.has('retry-after'))
        ? parseRetryAfter(response.headers.get('retry-after')) : null,
      rateLimit,
      providerErrorCode,
      hasFailedGeneration,
      providerRequestId,
    });
  }

  let content: unknown;
  let completionMeta: Record<string, unknown> = {};
  if (provider === 'gemini') {
    const candidate = body?.candidates?.[0];
    content = candidate?.content?.parts?.map((part: any) => part.text || '').join('');
    completionMeta = {
      finishReason: candidate?.finishReason || null,
      promptBlockReason: body?.promptFeedback?.blockReason || null,
    };
    if (!content && body?.promptFeedback?.blockReason) {
      throw Object.assign(new Error(`Gemini blocked this request (${body.promptFeedback.blockReason}).`), { retryable: false });
    }
  } else if (provider === 'cloudflare') {
    content = body?.result?.response ?? body?.result?.output ?? body?.response;
  } else {
    const choice = body?.choices?.[0];
    const message = choice?.message;
    content = message?.content;
    completionMeta = {
      finishReason: choice?.finish_reason || null,
      nativeFinishReason: choice?.native_finish_reason || null,
      refusal: Boolean(message?.refusal),
      hasReasoningOnly: !message?.content && Boolean(message?.reasoning || message?.reasoning_content),
    };
    if (!content && message?.refusal) {
      throw Object.assign(new Error(`${provider} refused the exam-generation request.`), { retryable: false });
    }
  }
  if (Array.isArray(content)) content = content.map((part: any) => part.text || '').join('');
  if (content && typeof content === 'object' && !Array.isArray(content)) content = JSON.stringify(content);
  try {
    return parseQuestionContent(content);
  } catch (error) {
    const requestId = response.headers.get('x-request-id')
      || response.headers.get('x-openrouter-generation-id')
      || response.headers.get('cf-ray');
    const detail = error instanceof Error ? error.message : 'Provider response could not be parsed.';
    throw Object.assign(new Error(
      `${provider} returned an unusable completion: ${detail} (finish=${String(completionMeta.finishReason || 'unknown')}, request=${requestId || 'unavailable'})`
    ), {
      status: null,
      retryable: true,
      providerRequestId: requestId,
      completionMeta,
    });
  }
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
        generationConfig: {
          responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2, maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: Math.max(0, Math.min(1024, Number(process.env.GEMINI_THINKING_BUDGET ?? 512) || 0)) },
        },
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
    const configuredServiceTier = process.env.GROQ_SERVICE_TIER?.trim();
    // "auto" is not available to every Groq organization; omit it and let
    // Groq select the account's default tier instead of failing every request.
    const groqServiceTier = configuredServiceTier && configuredServiceTier.toLowerCase() !== 'auto'
      ? configuredServiceTier
      : undefined;
    response = await fetch(isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json',
        ...(provider.id === 'openrouter' ? { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://projectkit.app', 'X-Title': 'Project KIT' } : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.2,
        ...(isGroq ? { max_completion_tokens: 8192, reasoning_effort: 'low' } : {
          max_tokens: 8192,
          provider: { require_parameters: true, allow_fallbacks: true },
        }),
        ...(isGroq && groqServiceTier ? { service_tier: groqServiceTier } : {}),
        // GPT-OSS 20B/120B support Groq strict structured outputs. This
        // prevents malformed JSON from becoming a provider-side HTTP 400.
        // Keep JSON mode for custom Groq models outside the documented allowlist.
        response_format: isGroq
          ? (['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].includes(provider.model.toLowerCase())
            ? { type: 'json_schema', json_schema: { name: 'project_kit_exam_questions', strict: true, schema } }
            : { type: 'json_object' })
          : { type: 'json_object' },
        ...(provider.id === 'openrouter' ? { plugins: [{ id: 'response-healing' }] } : {}),
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
  if (!providers.length) {
    await logSystemEvent({
      severity: 'error', source: 'exam.provider-router', code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: 'Exam generation was requested but no server-side AI provider key is configured.',
      metadata: { configuredProviderCount: 0 },
    });
    throw new Error('No exam AI provider is configured. Add at least one server-side provider API key.');
  }
  const failures: string[] = [];
  let lastStatus: number | null = null;
  let retryableFailure: { status: number | null; retryAfterMs: number | null; rateLimit: Record<string, string | null> | null } | null = null;
  let lastRateLimit: Record<string, string | null> | null = null;
  // The caller is a 60-second Next.js route. Keep provider failover inside a
  // 50-second budget so the job lease can be renewed/finalized safely.
  const totalSetting = Number(process.env.AI_PROVIDER_TOTAL_TIMEOUT_MS || 50_000);
  const providerSetting = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 18_000);
  const totalBudgetMs = Number.isFinite(totalSetting) ? Math.max(10_000, Math.min(totalSetting, 50_000)) : 50_000;
  const providerTimeoutMs = Number.isFinite(providerSetting) ? Math.max(3_000, Math.min(providerSetting, 25_000)) : 18_000;
  const deadline = Math.min(jobDeadline ?? Number.POSITIVE_INFINITY, Date.now() + totalBudgetMs);
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    const remainingMs = deadline - Date.now();
    if (remainingMs < 2_000) {
      failures.push('Provider failover time budget expired');
      break;
    }
    const cooldown = cooldownUntil.get(provider.id) || 0;
    if (cooldown > Date.now()) {
      const retryAfterMs = cooldown - Date.now();
      failures.push(`${provider.id} is rate-limited until its cooldown expires`);
      await logSystemEvent({
        severity: 'warn', source: 'exam.provider-router', code: 'AI_PROVIDER_COOLDOWN_ACTIVE',
        message: 'An exam provider was skipped because its rate-limit cooldown is still active.',
        metadata: { provider: provider.id, retryAfterMs },
      });
      continue;
    }
    try {
      const attemptTimeoutMs = computeAttemptTimeoutMs(providerTimeoutMs, remainingMs, providers.length - index);
      return await requestProvider(provider, messages, schema, attemptTimeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${provider.id} request failed`;
      const status = Number((error as Error & { status?: number }).status) || null;
      const retryAfterMs = Number((error as Error & { retryAfterMs?: number }).retryAfterMs) || null;
      const rateLimit = (error as Error & { rateLimit?: Record<string, string | null> }).rateLimit || null;
      const providerRequestId = (error as Error & { providerRequestId?: string | null }).providerRequestId || null;
      const completionMeta = (error as Error & { completionMeta?: Record<string, unknown> }).completionMeta || null;
      const providerErrorCode = (error as Error & { providerErrorCode?: string | null }).providerErrorCode || null;
      const hasFailedGeneration = Boolean((error as Error & { hasFailedGeneration?: boolean }).hasFailedGeneration);
      const retryable = Boolean((error as Error & { retryable?: boolean }).retryable)
        || error instanceof SyntaxError
        || /timeout|fetch failed|network|returned no questions|returned an empty response body/i.test(message);
      lastStatus = status;
      lastRateLimit = rateLimit;
      if (retryable) {
        const nextFailure = { status, retryAfterMs, rateLimit };
        if (!retryableFailure || (status === 429 && retryableFailure.status !== 429)
          || (status !== 429 && retryableFailure.status !== 429)) {
          retryableFailure = nextFailure;
        } else if (status === 429 && retryableFailure.status === 429 && (retryAfterMs || 0) > (retryableFailure.retryAfterMs || 0)) {
          retryableFailure = nextFailure;
        }
      }
      const safeDetail = message.replace(/\s+/g, ' ').slice(0, 180);
      failures.push(`${provider.id}${status ? ` HTTP ${status}` : ''}: ${safeDetail}`);
      await logSystemEvent({
        severity: retryable ? 'warn' : 'error', source: 'exam.provider-router',
        code: status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : status ? 'AI_PROVIDER_HTTP_ERROR' : 'AI_PROVIDER_REQUEST_FAILED',
        message: 'An AI provider could not complete an exam batch.',
        metadata: { provider: provider.id, status, retryable, detail: safeDetail, attempt: failures.length, providerRequestId, providerErrorCode, hasFailedGeneration, completionMeta },
      });
      // Continue to the next configured provider even for provider-specific 4xx
      // errors. One model may reject a schema or credential while another works.
    }
  }
  throw Object.assign(
    new Error(`No configured AI provider could complete this batch. ${failures.join(' | ').slice(0, 700)}`),
    {
      status: retryableFailure?.status ?? lastStatus,
      retryable: Boolean(retryableFailure),
      retryAfterMs: retryableFailure?.retryAfterMs ?? null,
      rateLimit: retryableFailure?.rateLimit ?? lastRateLimit,
    },
  );
}
