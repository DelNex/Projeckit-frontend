/**
 * Postgres / Supabase error code to user-friendly message mapping.
 * Import and call `friendlyError(err)` to get a displayable string.
 */

const PG_ERROR_MAP: Record<string, string> = {
  '23505': 'A record with this value already exists. Please use a unique value.',
  '23503': 'This record is referenced by other data and cannot be changed.',
  '42501': 'You do not have permission to perform this action.',
};

/**
 * Map a Postgres / Supabase error code to a human-readable label.
 * Returns `undefined` if the code is not recognized.
 */
export function pgErrorLabel(code: string): string | undefined {
  return PG_ERROR_MAP[code];
}

const NETWORK_ERROR_MSG = 'Could not reach the server. Check your connection and try again.';
const GENERIC_ERROR_MSG = 'Something went wrong. Please try again.';

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (!err) return false;
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('connection refused') ||
      msg.includes('offline')
    );
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message.toLowerCase() : '';
    return (
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('connection refused') ||
      msg.includes('offline')
    );
  }
  if (typeof err === 'string') {
    const msg = err.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('offline')
    );
  }
  return false;
}

/**
 * Extract a user-friendly error message from a Supabase / Postgres error,
 * a fetch Response JSON body, or a generic Error.
 * Never returns raw database text.
 */
export function friendlyError(
  err: unknown,
  fallback = GENERIC_ERROR_MSG,
): string {
  if (!err) return fallback;

  // 1. Check network / fetch failures
  if (isNetworkError(err)) {
    return NETWORK_ERROR_MSG;
  }

  // 2. Extract Postgres code if present in error object
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;

    // Direct error code (Postgres / Supabase)
    if (typeof obj.code === 'string' && PG_ERROR_MAP[obj.code]) {
      return PG_ERROR_MAP[obj.code];
    }

    // Embedded code in message
    if (typeof obj.message === 'string') {
      for (const code of Object.keys(PG_ERROR_MAP)) {
        if (obj.message.includes(code)) {
          return PG_ERROR_MAP[code];
        }
      }
    }
  }

  if (err instanceof Error) {
    // Check if message itself mentions known PG codes
    for (const code of Object.keys(PG_ERROR_MAP)) {
      if (err.message.includes(code)) {
        return PG_ERROR_MAP[code];
      }
    }
  }

  return fallback;
}

/**
 * Detect a duplicate-key (unique constraint) violation.
 */
export function isDuplicateError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as Record<string, unknown>).code === '23505';
}

/**
 * Detect a foreign-key violation.
 */
export function isForeignKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as Record<string, unknown>).code === '23503';
}
