/**
 * Project KIT — DepEd Account & Email Domain Validation
 * Enforces registration domain restrictions: default is @deped.gov.ph,
 * with support for configurable school domains.
 */

export const DEFAULT_ALLOWED_DOMAIN = 'deped.gov.ph';
export const ALLOWED_DEPED_DOMAIN = '@deped.gov.ph';

/**
 * Returns the configurable array of allowed registration domains.
 */
export function getAllowedRegistrationDomains(customList?: string[] | string | null): string[] {
  if (Array.isArray(customList) && customList.length > 0) {
    return customList.map((d) => d.replace(/^@/, '').trim().toLowerCase()).filter(Boolean);
  }
  if (typeof customList === 'string' && customList.trim()) {
    return customList
      .split(',')
      .map((d) => d.replace(/^@/, '').trim().toLowerCase())
      .filter(Boolean);
  }
  const envDomains = process.env.NEXT_PUBLIC_ALLOWED_REGISTRATION_DOMAINS || process.env.ALLOWED_REGISTRATION_DOMAINS;
  if (envDomains) {
    return envDomains
      .split(',')
      .map((d) => d.replace(/^@/, '').trim().toLowerCase())
      .filter(Boolean);
  }
  return [DEFAULT_ALLOWED_DOMAIN];
}

/**
 * Builds the error message showing the exact allowed domain list.
 */
export function getRegistrationErrorMessage(allowedDomains: string[] = getAllowedRegistrationDomains()): string {
  const formatted = allowedDomains.map((d) => `@${d}`).join(', ');
  if (allowedDomains.length === 1 && allowedDomains[0] === DEFAULT_ALLOWED_DOMAIN) {
    return 'Registration is restricted to official DepEd email addresses ending in @deped.gov.ph.';
  }
  return `Registration is restricted to official email addresses ending in ${formatted}.`;
}

export const DEPED_REGISTRATION_ERROR_MESSAGE =
  'Registration is restricted to official DepEd email addresses ending in @deped.gov.ph.';

/**
 * Validates whether an email belongs to the allowed domains list (default @deped.gov.ph).
 */
export function isValidDepEdEmail(email?: string | null, customDomains?: string[] | string | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const clean = email.trim().toLowerCase();
  const atIndex = clean.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === clean.length - 1) {
    return false;
  }

  const localPart = clean.substring(0, atIndex);
  const domain = clean.substring(atIndex + 1);

  // Validate standard local-part characters
  if (!/^[a-zA-Z0-9._%+-]+$/.test(localPart)) {
    return false;
  }

  const allowed = getAllowedRegistrationDomains(customDomains);
  return allowed.includes(domain);
}

/**
 * Checks if a given domain or email string is a DepEd domain.
 */
export function hasDepEdDomain(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return isValidDepEdEmail(email);
}
