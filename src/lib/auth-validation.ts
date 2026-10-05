/**
 * Project KIT — DepEd Account & Email Domain Validation
 * Enforces strict registration restrictions: only @deped.com.ph addresses are permitted.
 */

export const ALLOWED_DEPED_DOMAIN = '@deped.com.ph';

export const DEPED_REGISTRATION_ERROR_MESSAGE =
  'Registration is restricted to official DepEd email addresses ending in @deped.com.ph.';

/**
 * Validates whether an email is an official DepEd email ending in @deped.com.ph.
 * 
 * Rules:
 * - Must be a non-empty string.
 * - Must have a valid local part (letters, numbers, dots, hyphens, plus, underscores).
 * - Domain must strictly be deped.com.ph (case-insensitive).
 * 
 * @param email - The email address to validate.
 * @returns boolean - true if allowed, false otherwise.
 */
export function isValidDepEdEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const clean = email.trim().toLowerCase();
  
  // Strict regex matching: [local-part]@deped.com.ph
  const depedRegex = /^[a-zA-Z0-9._%+-]+@deped\.com\.ph$/i;
  
  return depedRegex.test(clean);
}

/**
 * Checks if a given domain or email string is a DepEd domain.
 */
export function hasDepEdDomain(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith(ALLOWED_DEPED_DOMAIN);
}
