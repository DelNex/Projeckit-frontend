import { logSystemEvent } from '@/lib/server/system-logger';

type RequestContext = {
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  revalidateReason?: string;
};

/**
 * Captures exceptions that escape Next.js route/render handling.
 * Expected validation and authorization responses are not logged as failures.
 */
export async function onRequestError(
  error: Error,
  request: { method?: string; url?: string },
  context: RequestContext,
) {
  await logSystemEvent({
    severity: 'error',
    source: 'next.request',
    message: error instanceof Error ? error.message : 'Unhandled Next.js request failure.',
    method: request.method || null,
    route: context.routePath || request.url?.split('?')[0] || null,
    code: 'UNHANDLED_NEXT_REQUEST',
    metadata: {
      routeType: context.routeType || null,
      renderSource: context.renderSource || null,
      revalidateReason: context.revalidateReason || null,
    },
  });
}
