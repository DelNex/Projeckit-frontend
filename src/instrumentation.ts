import { logSystemEvent } from '@/lib/server/system-logger';

type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
};

export async function onRequestError(
  error: Error,
  request: Request,
  context: RequestErrorContext
) {
  await logSystemEvent({
    severity: 'error',
    source: 'next.request',
    message: error?.message || 'Unhandled server request error.',
    route: context.routePath,
    method: request.method,
    status: 500,
    requestId: request.headers.get('x-nf-request-id')
      || request.headers.get('x-vercel-id')
      || request.headers.get('x-request-id'),
    metadata: {
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource || null,
    },
  });
}
