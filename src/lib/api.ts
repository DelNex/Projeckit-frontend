/** Same-origin client for the authenticated AI helper. */

function aiUrl(endpoint: 'info' | 'chat' | 'stream' | 'upload') {
  return `/api/backend/ai/${endpoint}`;
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  const message = body?.message || body?.error || fallback;
  return new Error(Array.isArray(message) ? message.join(', ') : message);
}

export const api = {
  ai: {
    getInfo: async () => {
      const response = await fetch(aiUrl('info'), { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw await readError(response, `AI helper info failed (${response.status})`);
      return response.json();
    },

    chat: async (payload: {
      message: string;
      assessmentId?: number | string;
      context?: Record<string, any>;
      uiContext?: Record<string, any>;
    }) => {
      const response = await fetch(aiUrl('chat'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await readError(response, `AI request failed (${response.status})`);
      const result = await response.json();
      return {
        reply: result?.reply || result?.message || 'I processed your request.',
        message: result?.message || result?.reply || 'I processed your request.',
        ...result,
      };
    },

    stream: async (
      payload: {
        message: string;
        assessmentId?: number | string;
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
      const response = await fetch(aiUrl('stream'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ ...payload, stream: true }),
        signal: callbacks.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw await readError(response, `AI stream failed (${response.status})`);
      if (!response.body) throw new Error('The browser could not read the AI response stream.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';
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
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
              continue;
            }
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]' || currentEvent === 'message_complete') {
              callbacks.onDone?.();
              return;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              // Some helper versions send unstructured text in data fields.
              callbacks.onChunk(data);
              currentEvent = 'message';
              continue;
            }
            if (currentEvent === 'error') {
              throw new Error(parsed.message || 'AI streaming error');
            }
            const text = parsed.text || parsed.chunk || parsed.delta;
            if (text) callbacks.onChunk(text);
            currentEvent = 'message';
          }
        }
        callbacks.onDone?.();
      } catch (error) {
        if ((error as any)?.name === 'AbortError') return;
        callbacks.onError?.(error);
        throw error;
      }
    },

    uploadModule: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(aiUrl('upload'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      if (!response.ok) throw await readError(response, 'Module upload failed');
      return response.json();
    },
  },
};
