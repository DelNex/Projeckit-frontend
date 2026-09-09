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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    NEXT_PUBLIC_SUPABASE_URL: url.trim(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey.trim(),
    NEXT_PUBLIC_APP_URL: appUrl.trim(),
  };
}
