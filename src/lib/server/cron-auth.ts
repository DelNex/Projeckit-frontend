import { timingSafeEqual } from 'node:crypto';

/**
 * Validates a server-to-server cron secret without leaking length/content
 * through a normal string comparison. Missing secrets fail closed.
 */
export function isAuthorizedCronRequest(
  request: Request,
  expectedSecret = process.env.AI_DISPATCH_CRON_SECRET || '',
): boolean {
  if (!expectedSecret || expectedSecret.length < 32) return false;

  const authorization = request.headers.get('authorization') || '';
  const suppliedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : request.headers.get('x-cron-secret') || '';

  if (!suppliedSecret || suppliedSecret.length !== expectedSecret.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(suppliedSecret, 'utf8'),
      Buffer.from(expectedSecret, 'utf8'),
    );
  } catch {
    return false;
  }
}
