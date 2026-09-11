/**
 * Project KIT — Frontend-to-Backend API Client Layer
 * Connects Next.js frontend to NestJS backend on NEXT_PUBLIC_API_BASE_URL (defaults to http://localhost:4000)
 * Includes auth credentials, CSRF token handling, and graceful fallback support.
 */

import { createClient } from '@/lib/supabase/client';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Base fetcher with automatic auth header injection and error wrapping
 */
export async function apiFetch<T = any>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { params, headers, ...restOptions } = options;

  let url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  // Get current auth token from Supabase if available
  let authToken: string | undefined;
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authToken = session.access_token;
    }
  } catch {
    // Non-blocking in SSR or unauthenticated state
  }

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };

  // Only attach application/json content-type if body is not FormData
  if (!(restOptions.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...restOptions,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...(headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.message ||
      errorData?.error ||
      `API Request Failed: ${response.status} ${response.statusText}`;
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return response.json();
}

/**
 * High-level API modules mapped to backend controllers
 */
export const api = {
  health: {
    check: () => apiFetch<{ status: string; database?: string; redis?: string }>('/api/health'),
  },

  assessments: {
    list: (params?: { status?: string; subjectId?: string; sectionId?: string }) =>
      apiFetch<{ success: boolean; data: any[] }>('/api/assessments', { params }),

    getOne: (id: number | string) =>
      apiFetch<{ success: boolean; data: any }>(`/api/assessments/${id}`),

    getResultsSummary: (assessmentId: number | string) =>
      apiFetch<any>(`/api/assessments/${assessmentId}/results/summary`),

    getItemAnalysis: (assessmentId: number | string) =>
      apiFetch<any[]>(`/api/assessments/${assessmentId}/results/items`),

    getStudentResults: (
      assessmentId: number | string,
      params?: { page?: number; limit?: number; search?: string }
    ) =>
      apiFetch<{ records: any[]; total: number; page: number; limit: number; totalPages: number }>(
        `/api/assessments/${assessmentId}/results/students`,
        { params }
      ),

    getCompetencies: (assessmentId: number | string) =>
      apiFetch<any[]>(`/api/assessments/${assessmentId}/results/competencies`),
  },

  ai: {
    getInfo: () => apiFetch<any>('/api/ai/info'),

    chat: (payload: {
      message: string;
      assessmentId?: number;
      context?: Record<string, any>;
      uiContext?: Record<string, any>;
    }) =>
      apiFetch<{ reply: string; data?: any }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    /**
     * SSE Streaming chat endpoint. Yields text chunks via callback.
     */
    stream: async (
      payload: {
        message: string;
        assessmentId?: number;
        context?: Record<string, any>;
        uiContext?: Record<string, any>;
      },
      callbacks: {
        onChunk: (text: string) => void;
        onDone?: () => void;
        onError?: (err: any) => void;
        signal?: AbortSignal;
      }
    ) => {
      let authToken: string | undefined;
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        authToken = session?.access_token;
      } catch {
        // ignore
      }

      const response = await fetch(`${API_BASE_URL}/api/ai/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ ...payload, stream: true }),
        signal: callbacks.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `AI stream failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser or response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (dataStr === '[DONE]') {
                callbacks.onDone?.();
                return;
              }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.chunk || parsed.text || parsed.delta) {
                  callbacks.onChunk(parsed.chunk || parsed.text || parsed.delta);
                }
              } catch {
                // If it's raw text chunk
                callbacks.onChunk(dataStr);
              }
            }
          }
        }
        callbacks.onDone?.();
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          return;
        }
        callbacks.onError?.(err);
        throw err;
      }
    },

    uploadModule: async (file: File) => {
      let authToken: string | undefined;
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        authToken = session?.access_token;
      } catch {
        // ignore
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/ai/upload`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Module upload failed');
      }

      return response.json();
    },
  },

  recommendations: {
    list: () => apiFetch<{ success: boolean; data: any[] }>('/api/recommendation'),
  },
};

