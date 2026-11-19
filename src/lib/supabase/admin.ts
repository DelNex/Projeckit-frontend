import { createClient } from '@supabase/supabase-js';


export class InvalidServiceKeyError extends Error {
  code = 'INVALID_SERVICE_KEY';
  constructor(message = 'SUPABASE_SERVICE_ROLE_KEY must be a Supabase server key for this project. Do not use an AI-provider key.') {
    super(message);
    this.name = 'InvalidServiceKeyError';
  }
}

/** Reject common credential mix-ups before sending a request to Supabase. */
export function validateSupabaseServiceKey(key: string): string {
  if (/^gsk_/i.test(key)) {
    throw new InvalidServiceKeyError('SUPABASE_SERVICE_ROLE_KEY contains a Groq API key (gsk_). Set the Supabase service_role/server key here and keep GROQ_API_KEY separate.');
  }
  if (/^sb_publishable_/i.test(key)) {
    throw new InvalidServiceKeyError('SUPABASE_SERVICE_ROLE_KEY contains a public publishable key. Set the Supabase server key instead.');
  }
  if (key.startsWith('eyJ')) {
    try {
      const payload = key.split('.')[1];
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (claims.role !== 'service_role') {
        throw new InvalidServiceKeyError('SUPABASE_SERVICE_ROLE_KEY is a Supabase JWT, but its role is not service_role.');
      }
    } catch (error) {
      if (error instanceof InvalidServiceKeyError) throw error;
      throw new InvalidServiceKeyError('SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase service-role JWT.');
    }
  }
  return key;
}

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

  const validatedServiceKey = validateSupabaseServiceKey(serviceRoleKey);

  return createClient(supabaseUrl, validatedServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
