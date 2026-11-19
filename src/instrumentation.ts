/**
 * Captures unhandled Next.js server errors as a last-resort observability path.
 * Expected API failures are logged at their route boundary with richer context.
 */
export async function onRequestError(
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
  // The logger uses Node crypto and the server-only Supabase service client.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { logSystemEvent } = await import('@/lib/server/system-logger');
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
  } catch (loggingError) {
    // Instrumentation must never turn an application error into a second failure.
    console.error(
      '[instrumentation] Could not persist an unhandled request error:',
      loggingError instanceof Error ? loggingError.message : 'unknown error',
    );
  }
}
