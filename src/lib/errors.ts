'use client';

/**
 * Postgres / Supabase error code to user-friendly message mapping.
 * Import and call `friendlyError(err)` to get a displayable string.
 */

const PG_ERROR_MAP: Record<string, string> = {
  '23505': 'A record with this value already exists. Please use a unique value.',
  '23503': 'This record is referenced by other data and cannot be changed.',
  '23502': 'A required field is missing. Please fill in all required fields.',
  '23514': 'A value is out of the allowed range. Please check your input.',
  '42501': 'You do not have permission to perform this action.',
  '42P01': 'The requested resource could not be found in the database.',
  'PGRST116': 'The requested record was not found.',
  'PGRST301': 'You are not authorized to access this resource.',
};

/**
 * Map a Postgres / Supabase error code to a human-readable label.
 * Returns `undefined` if the code is not recognized.
 */
export function pgErrorLabel(code: string): string | undefined {
  return PG_ERROR_MAP[code];
}

/**
 * Extract a user-friendly error message from a Supabase / Postgres error,
 * a fetch Response JSON body, or a generic Error.
 *
 * Usage:
 * ```ts
 * try { … } catch (err) {
 *   toast.error(friendlyError(err));
 * }
 * ```
 */
export function friendlyError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!err) return fallback;

  // Supabase client errors: { code, message, details, hint }
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;

    // Postgres error code
    if (typeof obj.code === 'string' && PG_ERROR_MAP[obj.code]) {
      return PG_ERROR_MAP[obj.code];
    }

    // Supabase REST error
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      // Check for embedded PG code in the message
      const codeMatch = obj.message.match(/violates\s+\w+\s+constraint/i);
      if (codeMatch && typeof obj.code === 'string') {
        return PG_ERROR_MAP[obj.code] || obj.message;
      }
      return obj.message;
    }
  }

  if (err instanceof Error) {
    return err.message || fallback;
  }

  if (typeof err === 'string') {
    return err;
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

