import { createAdminClient } from '@/lib/supabase/admin';

export type SystemEventInput = {
  severity?: 'error' | 'warning' | 'info';
  source: string;
  message: string;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  code?: string | null;
  requestId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

function cleanText(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  return value
    .replace(/(?:Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:gsk_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/gi, '[REDACTED]')
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, max);
}

/** Best-effort server-side logging. Logging failures must never break the request. */
export async function logSystemEvent(input: SystemEventInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const severity = input.severity || 'error';
    const action = severity === 'warning' ? 'SYSTEM_WARNING' : severity === 'info' ? 'SYSTEM_INFO' : 'SYSTEM_ERROR';
    const details = {
      severity,
      source: cleanText(input.source, 120),
      message: cleanText(input.message, 700),
      route: cleanText(input.route, 240),
      method: cleanText(input.method, 12),
      status: Number.isInteger(input.status) ? input.status : null,
      code: cleanText(input.code, 100),
      request_id: cleanText(input.requestId, 120),
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata, (_key, value) => {
        if (typeof value === 'string') return cleanText(value, 240);
        return value;
      })) : {},
    };
    const { error } = await admin.from('audit_logs').insert({
      tenant_id: input.tenantId || null,
      user_id: input.userId || null,
      action,
      device: 'server',
      details,
    });
    if (error) console.error('[system logger] Could not persist system event:', error.message);
  } catch (error) {
    console.error('[system logger] Logging is unavailable:', error instanceof Error ? error.message : 'unknown error');
  }
}
