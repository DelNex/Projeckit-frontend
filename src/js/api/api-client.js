const API_BASE_URL = typeof process !== 'undefined' && process.env && process.env.API_BASE_URL ? process.env.API_BASE_URL : '';

function buildUrl(endpoint) {
  if (typeof endpoint !== 'string') {
    throw new TypeError('Expected endpoint to be a string');
  }

  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const base = API_BASE_URL || window.location.origin;
  return new URL(endpoint.replace(/^\/+/, '/'), base.endsWith('/') ? base : `${base}/`).toString();
}

let csrfToken = null;

function normalizeErrorResponse(response, body) {
  const baseMessage = body?.message || body?.error || response.statusText || 'Request failed';
  const message =
    response.status === 401
      ? 'You must sign in to continue.'
      : response.status === 403
      ? 'You do not have permission to perform this action.'
      : response.status === 429
      ? 'Too many requests. Please try again later.'
      : response.status >= 500
      ? 'Server error. Please try again later.'
      : baseMessage;

  const error = {
    status: response.status,
    ok: response.ok,
    message,
    details: body,
  };

  if ([401, 403, 429].includes(response.status) || response.status >= 500) {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('deped_api_error', { detail: error }));
    }
  }

  return error;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function ensureCsrfToken(method) {
  if (method === 'GET') return;
  if (csrfToken) return;
  try {
    await fetchCsrfToken();
  } catch (e) {
    console.warn('[ApiClient] Failed to fetch CSRF token', e);
  }
}

async function request(endpoint, { method = 'GET', headers = {}, body = null, signal } = {}) {
  const url = buildUrl(`/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
  const opts = {
    method: method.toUpperCase(),
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    credentials: 'include',
    signal,
  };

  await ensureCsrfToken(opts.method);

  if (csrfToken && opts.method !== 'GET' && !opts.headers['x-csrf-token']) {
    opts.headers['x-csrf-token'] = csrfToken;
  }

  if (body != null) {
    if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob) {
      opts.body = body;
    } else if (typeof body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else {
      opts.body = String(body);
    }
  }

  const response = await fetch(url, opts);
  const payload = await parseJson(response);
  if (response.ok) {
    return payload || { success: true };
  }

  throw normalizeErrorResponse(response, payload);
}

export async function get(endpoint, options = {}) {
  return request(endpoint, { ...options, method: 'GET' });
}

export async function post(endpoint, body, options = {}) {
  return request(endpoint, { ...options, method: 'POST', body });
}

export async function put(endpoint, body, options = {}) {
  return request(endpoint, { ...options, method: 'PUT', body });
}

export async function patch(endpoint, body, options = {}) {
  return request(endpoint, { ...options, method: 'PATCH', body });
}

export async function del(endpoint, options = {}) {
  return request(endpoint, { ...options, method: 'DELETE' });
}

export function setCsrfToken(token) {
  csrfToken = token || null;
  return csrfToken;
}

export async function fetchCsrfToken() {
  const response = await get('/auth/csrf');
  const token = response?.csrfToken || null;
  setCsrfToken(token);
  return token;
}
