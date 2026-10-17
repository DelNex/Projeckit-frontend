/**
 * Postgres / Supabase error code to user-friendly message mapping.
 * Import and call `friendlyError(err)` to get a displayable string.
 */

const PG_ERROR_MAP: Record<string, string> = {
  '23505': 'A record with this value already exists. Please use a unique value.',
  '23503': 'This record is referenced by other data and cannot be changed.',
  '42501': 'You do not have permission to perform this action.',
  'PGRST204': 'A required database column is missing from the database schema cache. Please ensure all migrations have been applied.',
  'P0001': 'A database validation rule blocked this action.',
};

export interface TechnicalErrorDetails {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  fullText: string;
}

/**
 * Extracts raw technical error details for admin diagnostics and copy-to-clipboard.
 */
export function extractTechnicalError(err: unknown): TechnicalErrorDetails {
  if (!err) {
    return { fullText: 'Unknown error (null or undefined)' };
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code : undefined;
    const message = typeof obj.message === 'string' ? obj.message : undefined;
    const details = typeof obj.details === 'string' ? obj.details : undefined;
    const hint = typeof obj.hint === 'string' ? obj.hint : undefined;
    const fullText = JSON.stringify(
      { code, message, details, hint, ...obj },
      null,
      2
    );
    return { code, message, details, hint, fullText };
  }
  return { fullText: String(err) };
}

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
    return err.message.toLowerCase().includes('failed to fetch');
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message.toLowerCase() : '';
    return msg.includes('failed to fetch');
  }
  if (typeof err === 'string') {
    return err.toLowerCase().includes('failed to fetch');
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

    // Specific PostgREST missing column handling
    if (obj.code === 'PGRST204') {
      const colMatch = typeof obj.message === 'string' ? obj.message.match(/Could not find the '([^']+)' column/i) : null;
      if (colMatch) {
        return `Database schema is missing column '${colMatch[1]}'. Please run the latest Supabase migrations.`;
      }
      return PG_ERROR_MAP['PGRST204'];
    }

    // Specific PostgreSQL business rule exception (RAISE EXCEPTION)
    if (obj.code === 'P0001' && typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message.trim();
    }

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
