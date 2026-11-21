import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getConfiguredExamProviders } from '@/lib/server/exam-ai-provider-router';

export const dynamic = 'force-dynamic';

type ProviderId = 'groq' | 'openrouter' | 'gemini';
type ProviderCheck = { provider: ProviderId; status: 'available' | 'rate_limited' | 'authentication_error' | 'unavailable' };

async function checkProvider(provider: ProviderId): Promise<ProviderCheck> {
  const configs = {
    groq: { key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/models', headers: {} },
    openrouter: { key: process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/models', headers: { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://projectkit.app', 'X-Title': 'Project KIT' } },
    gemini: { key: process.env.GEMINI_API_KEY, url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', headers: {} },
  } satisfies Record<ProviderId, { key: string | undefined; url: string; headers: Record<string, string> }>;
  const config = configs[provider];
  if (!config.key) return { provider, status: 'unavailable' };

  try {
    const response = await fetch(config.url, {
      method: 'GET',
      headers: {
        ...config.headers,
        ...(provider === 'gemini' ? { 'x-goog-api-key': config.key } : { Authorization: `Bearer ${config.key}` }),
      },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });
    if (response.ok) return { provider, status: 'available' };
    if (response.status === 429) return { provider, status: 'rate_limited' };
    if (response.status === 401 || response.status === 403) return { provider, status: 'authentication_error' };
    return { provider, status: 'unavailable' };
  } catch {
    return { provider, status: 'unavailable' };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to check AI availability.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles')
    .select('status,archived_at,tenant_id').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
    return NextResponse.json({ error: 'Approved access is required.' }, { status: 403 });
  }

  // Cloudflare is intentionally not part of ProjectKIT's active readiness check.
  const configured = getConfiguredExamProviders().filter((id): id is ProviderId =>
    id === 'groq' || id === 'openrouter' || id === 'gemini'
  );
  if (!configured.length) {
    return NextResponse.json({
      status: 'unconfigured',
      providers: [],
      generationVerified: false,
      checkedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const providers = await Promise.all(configured.map(checkProvider));
  const available = providers.filter((provider) => provider.status === 'available').length;
  const status = available === providers.length ? 'available'
    : available > 0 ? 'degraded'
      : providers.some((provider) => provider.status === 'rate_limited') ? 'rate_limited'
        : 'unavailable';

  return NextResponse.json({
    status,
    providers,
    // Model-list endpoints validate API access, not inference quota or model output.
    generationVerified: false,
    checkedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
