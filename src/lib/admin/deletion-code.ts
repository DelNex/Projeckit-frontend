import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Hashes a deletion code with scrypt and a cryptographically secure random salt.
 * Stored in format: scrypt:<salt>:<derivedKeyHex>
 */
export function hashDeletionCode(code: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(code, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

/**
 * Verifies a deletion code against the stored scrypt hash using constant-time comparison.
 */
export function verifyDeletionCode(code: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const [, salt, expectedHashHex] = parts;
    const computedHash = crypto.scryptSync(code, salt, 64);
    const expectedHash = Buffer.from(expectedHashHex, 'hex');

    if (computedHash.length !== expectedHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedHash, expectedHash);
  } catch (err) {
    console.error('[verifyDeletionCode] Error verifying hash:', err);
    return false;
  }
}

export interface DeletionCodeStatus {
  hasCode: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  minutesRemaining?: number;
}

/**
 * Checks deletion code status for a given school tenant.
 */
export async function getTenantDeletionCodeStatus(
  adminClient: SupabaseClient,
  tenantId: string
): Promise<DeletionCodeStatus> {
  const { data, error } = await adminClient
    .from('admin_delete_codes')
    .select('tenant_id, code_hash, failed_attempts, locked_until')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) {
    return {
      hasCode: false,
      isLocked: false,
      lockedUntil: null,
      failedAttempts: 0,
    };
  }

  const now = new Date();
  const lockedUntil = data.locked_until ? new Date(data.locked_until) : null;
  const isLocked = Boolean(lockedUntil && lockedUntil > now);
  const minutesRemaining = isLocked && lockedUntil
    ? Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60)))
    : undefined;

  return {
    hasCode: Boolean(data.code_hash),
    isLocked,
    lockedUntil: data.locked_until || null,
    failedAttempts: data.failed_attempts || 0,
    minutesRemaining,
  };
}

/**
 * Validates the deletion code submitted by an admin for a school tenant.
 * Updates failed attempts and locks for 15 minutes after 5 failures.
 */
export async function checkAndVerifyDeletionCode(
  adminClient: SupabaseClient,
  tenantId: string,
  enteredCode: string,
  callerId: string
): Promise<{
  success: boolean;
  error?: string;
  isLocked?: boolean;
}> {
  const { data, error } = await adminClient
    .from('admin_delete_codes')
    .select('tenant_id, code_hash, failed_attempts, locked_until')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data || !data.code_hash) {
    return {
      success: false,
      error: 'Set a deletion code in Admin Settings first.',
    };
  }

  const now = new Date();
  if (data.locked_until) {
    const lockedUntil = new Date(data.locked_until);
    if (lockedUntil > now) {
      const minutesRemaining = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60)));
      return {
        success: false,
        isLocked: true,
        error: `Action locked due to too many failed attempts. Please try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`,
      };
    }
  }

  const isValid = verifyDeletionCode(enteredCode, data.code_hash);

  if (isValid) {
    // Reset failed attempts on success
    await adminClient
      .from('admin_delete_codes')
      .update({
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);

    return { success: true };
  }

  // Code was incorrect: increment failed attempts
  const newFailedAttempts = (data.failed_attempts || 0) + 1;
  const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;
  const newLockedUntil = shouldLock
    ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    : null;

  await adminClient
    .from('admin_delete_codes')
    .update({
      failed_attempts: newFailedAttempts,
      locked_until: newLockedUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  // Log failed attempt to audit log
  await adminClient.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: callerId,
    action: 'DELETION_CODE_FAILED',
    details: {
      failed_attempts: newFailedAttempts,
      locked: shouldLock,
      locked_until: newLockedUntil,
    },
  });

  if (shouldLock) {
    return {
      success: false,
      isLocked: true,
      error: `Too many failed attempts. This action is locked for ${LOCKOUT_MINUTES} minutes.`,
    };
  }

  const attemptsLeft = MAX_FAILED_ATTEMPTS - newFailedAttempts;
  return {
    success: false,
    error: `Incorrect deletion code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before a 15-minute lockout.`,
  };
}

