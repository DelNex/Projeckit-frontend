/**
 * Project KIT — Frontend Environment Validation Layer
 * Ensures required public Supabase configuration is present.
 * Throws explicit errors if required configuration is missing.
 */

export interface FrontendEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
}

export function getValidatedFrontendEnv(): FrontendEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!publishableKey || publishableKey.trim() === '') {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredAppUrl) {
    throw new Error('Missing NEXT_PUBLIC_APP_URL');
  }

  let appUrl: string;
  try {
    const parsedAppUrl = new URL(configuredAppUrl);
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (parsedAppUrl.username || parsedAppUrl.password || parsedAppUrl.search || parsedAppUrl.hash ||
      (parsedAppUrl.protocol !== 'https:' && !(isDevelopment && parsedAppUrl.protocol === 'http:'))) {
      throw new Error('Invalid application URL');
    }
    appUrl = parsedAppUrl.origin;
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be a valid HTTPS origin in production.');
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: url.trim(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey.trim(),
    NEXT_PUBLIC_APP_URL: appUrl.trim(),
  };
}
