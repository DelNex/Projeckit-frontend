/**
 * Runtime-aware Next.js request instrumentation.
 * Keep Node-only observability dependencies out of Edge bundles.
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
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { captureRequestError } = await import('./instrumentation-node');
    await captureRequestError(error, request, context);
  } catch (loggingError) {
    console.error(
      '[instrumentation] Could not persist an unhandled request error:',
      loggingError instanceof Error ? loggingError.message : 'unknown error',
    );
  }
}
