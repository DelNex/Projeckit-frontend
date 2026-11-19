type BackendUrlEnvironment = Pick<NodeJS.ProcessEnv, 'BACKEND_API_BASE_URL' | 'NODE_ENV' | 'NEXT_PUBLIC_APP_URL'>;

/**
 * Resolve the private AI backend origin without ever silently routing a
 * production request to a developer's localhost.
 */
export function resolveBackendBaseUrl(env: BackendUrlEnvironment = process.env): string | null {
  const configured = env.BACKEND_API_BASE_URL?.trim();
  if (!configured) {
    return env.NODE_ENV === 'development' ? 'http://localhost:4000' : null;
  }

  try {
    const url = new URL(configured);
    const isDevelopment = env.NODE_ENV === 'development';
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(isDevelopment && url.protocol === 'http:')) return null;
    if (!url.hostname) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Resolve the public application origin used by password-reset links. */
export function resolvePublicAppUrl(env: BackendUrlEnvironment = process.env): string | null {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return env.NODE_ENV === 'development' ? 'http://localhost:3000' : null;
  try {
    const url = new URL(configured);
    const isDevelopment = env.NODE_ENV === 'development';
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(isDevelopment && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}
