import { logSystemEvent } from '@/lib/server/system-logger';

export async function captureRequestError(
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[]>;
  },
  context: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
    renderSource?: string;
    renderType?: string;
    revalidateReason?: string;
  },
) {
  const message = error instanceof Error
    ? error.message
    : String(error ?? 'Unknown unhandled server error');
  const requestIdHeader = request.headers['x-nf-request-id'] || request.headers['x-request-id'];
  const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;

  await logSystemEvent({
    severity: 'error',
    source: 'next.request',
    message,
    method: request.method,
    route: context.routePath || request.path.split('?')[0],
    code: 'NEXT_UNHANDLED_REQUEST_ERROR',
    requestId: requestId || null,
    metadata: {
      routerKind: context.routerKind || null,
      routeType: context.routeType || null,
      renderSource: context.renderSource || null,
      renderType: context.renderType || null,
      revalidateReason: context.revalidateReason || null,
      digest: error && typeof error === 'object' && 'digest' in error
        ? String((error as { digest?: unknown }).digest || '')
        : null,
    },
  });
}
