import { logSystemEvent } from '@/lib/server/system-logger';

type RequestError = {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
};

type RequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  renderType?: string;
  revalidateReason?: string;
};

function getHeader(headers: RequestError['headers'], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export async function captureRequestError(
  error: unknown,
  request: RequestError,
  context: RequestErrorContext,
) {
  const message = error instanceof Error
    ? error.message
    : String(error || 'Unhandled server request error.');

  await logSystemEvent({
    severity: 'error',
    source: 'next.request',
    message,
    route: context.routePath || request.path.split('?')[0],
    method: request.method,
    status: 500,
    requestId: getHeader(request.headers, 'x-nf-request-id')
      || getHeader(request.headers, 'x-vercel-id')
      || getHeader(request.headers, 'x-request-id'),
    metadata: {
      routerKind: context.routerKind || null,
      routeType: context.routeType || null,
      renderSource: context.renderSource || null,
      renderType: context.renderType || null,
      revalidateReason: context.revalidateReason || null,
    },
  });
}
