import { logSystemEvent } from '@/lib/server/system-logger';

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
};

type RequestContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  renderType?: string;
  revalidateReason?: string;
};

function readHeader(headers: RequestInfo['headers'], name: string): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** Persist unhandled Next.js request errors without allowing diagnostics to break rendering. */
export async function captureRequestError(
  error: unknown,
  request: RequestInfo,
  context: RequestContext,
): Promise<void> {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string' ? error : 'Unknown unhandled server error';
  await logSystemEvent({
    severity: 'error',
    source: 'next.request',
    code: 'NEXT_REQUEST_ERROR',
    message,
    method: request.method,
    route: context.routePath || request.path,
    requestId: readHeader(request.headers, 'x-request-id')
      || readHeader(request.headers, 'x-vercel-id')
      || readHeader(request.headers, 'x-nf-request-id'),
    metadata: {
      routerKind: context.routerKind || null,
      routeType: context.routeType || null,
      renderSource: context.renderSource || null,
      renderType: context.renderType || null,
      revalidateReason: context.revalidateReason || null,
      errorName: error instanceof Error ? error.name : typeof error,
    },
  });
}
