# AI exam generation troubleshooting

## Groq provider errors

AI exam generation uses the configured provider order. When Groq is the only configured provider, a request failure cannot fall back to another provider.

Provider failures should retain the provider HTTP status and a bounded, sanitized error detail in the failed job record and server diagnostics. Do not expose API keys, authorization headers, or raw request payloads in client-facing errors.

HTTP 400-class request errors usually indicate that the request needs correction. They should not be retried immediately against the same provider. Timeouts, network failures, HTTP 408/409/429, and HTTP 5xx responses may be transient and can be retried according to the provider policy.

## TOS retry cooldown

After a failed top-level generation for a TOS, the API enforces a two-minute cooldown before another attempt. A cooldown response includes:

- `code: EXAM_TOS_RETRY_COOLDOWN`
- The previous failed job ID
- The previous saved provider error, when available
- `retryAfterSeconds` and the HTTP `Retry-After` header

The cooldown protects the TOS from repeated immediate retries. It does not mean the original failure was caused by rate limiting.

## Safe recovery

A failed generation must not replace an existing exam with incomplete or invalid questions. After the cooldown expires, upload the lesson source again if the previous job's source payload has been cleared, then retry generation. Validate the resulting questions against the saved TOS before using them.
