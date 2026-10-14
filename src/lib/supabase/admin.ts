import { createClient } from '@supabase/supabase-js';

export class MissingServiceKeyError extends Error {
  code = 'MISSING_SERVICE_KEY';
  constructor(
    message = 'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in server environment. Please configure it in the server environment.'
  ) {
    super(message);
    this.name = 'MissingServiceKeyError';
  }
}

/**
 * Service-role Supabase client for trusted server-only routes.
 * Throws MissingServiceKeyError at request time if keys are absent.
 * WARNING: Never import or use this client in browser/client components.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new MissingServiceKeyError();
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
