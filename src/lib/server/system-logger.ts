export type SystemEvent = {
  severity: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  method?: string | null;
  route?: string | null;
  code?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

function redact(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, '[URL_WITH_QUERY_REDACTED]');
}

function safeMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 30)) {
    if (/token|secret|password|authorization|api.?key|cookie/i.test(key)) output[key] = '[REDACTED]';
    else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      output[key] = typeof value === 'string' ? redact(value).slice(0, 500) : value;
    } else output[key] = '[OMITTED]';
  }
  return output;
}

/** Structured, secret-safe server diagnostics. Logging must never break a request. */
export async function logSystemEvent(event: SystemEvent): Promise<void> {
  try {
    const record = {
      timestamp: new Date().toISOString(),
      severity: event.severity,
      source: redact(event.source).slice(0, 80),
      code: event.code ? redact(event.code).slice(0, 100) : null,
      message: redact(event.message || 'Unknown server error').slice(0, 1200),
      method: event.method ? event.method.slice(0, 12) : null,
      route: event.route ? event.route.split('?')[0].slice(0, 240) : null,
      requestId: event.requestId ? event.requestId.slice(0, 160) : null,
      metadata: safeMetadata(event.metadata),
    };
    const line = JSON.stringify(record);
    if (event.severity === 'error') console.error('[projectkit]', line);
    else if (event.severity === 'warn') console.warn('[projectkit]', line);
    else console.info('[projectkit]', line);
  } catch {
    // Diagnostics must never cause a second application failure.
  }
}
