import { createBrowserClient } from '@supabase/ssr';
import { getValidatedFrontendEnv } from '@/lib/env';

export function createClient() {
  const env = getValidatedFrontendEnv();
  return createBrowserClient<any>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
