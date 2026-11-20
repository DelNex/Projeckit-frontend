/** Safe, non-technical messages for teachers. Raw provider errors stay in server logs. */
export function getTeacherExamFailureMessage(error: unknown, progress?: unknown): string {
  const raw = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  const metadata = progress && typeof progress === 'object' ? progress as Record<string, unknown> : {};
  const embeddedStatuses = [...raw.matchAll(/HTTP\s+(\d{3})/gi)].map((match) => Number(match[1]));
  const embeddedStatus = embeddedStatuses[embeddedStatuses.length - 1] || 0;
  const status = Number(metadata.providerStatus) || embeddedStatus;
  if (status === 401 || status === 403) {
    return 'The AI service connection needs attention. Please contact your school administrator.';
  }
  if (status === 429) {
    return 'The AI services are busy right now. Please wait for the retry time before generating again.';
  }
  if (status === 408 || status === 503 || status >= 500) {
    return 'The AI services are temporarily unavailable. Your existing questions are safe. Please try again shortly.';
  }
  if (/schema|invalid.*json|empty response|no questions|malformed/i.test(raw)) {
    return 'We could not create a complete exam from these materials. Check the lesson content and try again.';
  }
  return 'We could not complete exam generation. Your existing questions were not changed. Please try again.';
}
