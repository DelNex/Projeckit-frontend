import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedEndpoints = new Set(['info', 'chat', 'stream', 'upload']);

function backendBaseUrl() {
  const configured = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
  return configured.replace(/\/+$/, '');
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const segments = (await context.params).path;
  if (segments.length !== 1 || !allowedEndpoints.has(segments[0])) {
    return NextResponse.json({ message: 'AI endpoint not found.' }, { status: 404 });
  }

  // Reject cross-site writes. The session cookie is intentionally never
  // forwarded; the backend receives only a validated Supabase access token.
  if (request.method !== 'GET' && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Request origin could not be verified.' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  if (userError || !user || !session?.access_token) {
    return NextResponse.json({ message: 'Please sign in to use the AI helper.' }, { status: 401 });
  }

  const endpoint = segments[0];
  const upstreamUrl = `${backendBaseUrl()}/api/ai/${endpoint}${request.nextUrl.search}`;
  const headers = new Headers({
    Authorization: `Bearer ${session.access_token}`,
    Accept: request.headers.get('accept') || 'application/json',
  });
  let body: BodyInit | undefined;
  if (request.method !== 'GET') {
    if (endpoint === 'upload') {
      const incoming = await request.formData();
      const outgoing = new FormData();
      for (const [key, value] of incoming.entries()) outgoing.append(key, value);
      body = outgoing;
    } else {
      const contentType = request.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
      body = await request.arrayBuffer();
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      signal: request.signal,
    });
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    const cacheControl = upstream.headers.get('cache-control');
    responseHeaders.set('Cache-Control', cacheControl || 'no-store');
    if (endpoint === 'stream') {
      responseHeaders.set('X-Accel-Buffering', 'no');
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error('[AI proxy] Backend request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'The AI helper is unavailable right now. Please retry in a moment.' }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if ((await context.params).path[0] !== 'info') {
    return NextResponse.json({ message: 'Method not allowed.' }, { status: 405 });
  }
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (['info'].includes((await context.params).path[0])) {
    return NextResponse.json({ message: 'Method not allowed.' }, { status: 405 });
  }
  return proxy(request, context);
}
