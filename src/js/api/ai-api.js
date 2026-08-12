import { post, get } from './api-client.js';

// Derive the current screen slug from the URL so the backend can orient
// the AI around the page the teacher is on. Falls back to 'dashboard'.
export function getCurrentPageSlug() {
  if (typeof window === 'undefined') return 'dashboard';
  const raw = window.location.pathname.split('/').pop() || '';
  const slug = raw.replace(/\.html$/, '').toLowerCase();
  return slug && slug !== '/' ? slug : 'dashboard';
}

/** Parse assessmentId from URL query string (?id=42) */
export function getCurrentAssessmentId() {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('id');
  return id ? Number(id) : null;
}

/** Standard (non-streaming) chat request */
export async function sendAiChat(message, context = {}, assessmentId = null) {
  const body = {
    message,
    context: { ...context, page: getCurrentPageSlug() },
  };
  if (assessmentId) body.assessmentId = assessmentId;
  return post('/ai/chat', body);
}

/**
 * SSE streaming chat.
 * Returns an EventSource-compatible object. The caller should listen for:
 *   message_start, context_resolved, tool_start, tool_result,
 *   thinking_start, answer_delta, message_complete, error
 *
 * Uses fetch + ReadableStream because the backend uses POST with SSE.
 */
export async function sendAiChatStream(message, context = {}, assessmentId = null, { signal } = {}) {
  const base = typeof API_BASE_URL_RAW !== 'undefined' ? API_BASE_URL_RAW : '';
  const url = `${base || window.location.origin}/api/ai/stream`;

  const body = {
    message,
    stream: true,
    context: { ...context, page: getCurrentPageSlug() },
  };
  if (assessmentId) body.assessmentId = assessmentId;

  // Fetch CSRF token if we have the helper available
  let csrfHeader = {};
  try {
    const { fetchCsrfToken } = await import('./api-client.js');
    const token = await fetchCsrfToken();
    if (token) csrfHeader = { 'x-csrf-token': token };
  } catch { /* ignore — CSRF fetch is best-effort */ }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...csrfHeader },
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw { status: response.status, message: err.message || 'AI stream request failed' };
  }

  return response.body; // ReadableStream<Uint8Array>
}

/** Upload a teaching module for AI context injection */
export async function uploadModule(file) {
  const base = typeof API_BASE_URL_RAW !== 'undefined' ? API_BASE_URL_RAW : '';
  const url = `${base || window.location.origin}/api/ai/upload`;

  // Fetch CSRF token
  let csrfHeader = {};
  try {
    const { fetchCsrfToken } = await import('./api-client.js');
    const token = await fetchCsrfToken();
    if (token) csrfHeader = { 'x-csrf-token': token };
  } catch { /* ignore */ }

  const form = new FormData();
  form.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', ...csrfHeader },
    credentials: 'include',
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw { status: response.status, message: data.message || 'Upload failed' };
  return data;
}

export async function getAiInfo() {
  return get('/ai/info');
}

export default { sendAiChat, sendAiChatStream, uploadModule, getAiInfo, getCurrentPageSlug, getCurrentAssessmentId };
