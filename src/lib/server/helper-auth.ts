import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const ipWindows = new Map<string, { start: number; count: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 180;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function authorizeHelperRequest(request: Request): NextResponse | null {
  const expected = process.env.GEMINI_HELPER_TOKEN || '';
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expected.length < 32 || expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const window = ipWindows.get(ip);
  if (!window || now - window.start >= WINDOW_MS) ipWindows.set(ip, { start: now, count: 1 });
  else if (++window.count > MAX_PER_WINDOW) return NextResponse.json({ error: 'Too many helper requests. Try again shortly.' }, { status: 429 });
  return null;
}

export async function readHelperJson(request: Request): Promise<Record<string, any> | null> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
