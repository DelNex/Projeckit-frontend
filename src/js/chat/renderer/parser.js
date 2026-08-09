export function parseAIResponse(detail = {}) {
  const responseText = detail.response ?? detail.message ?? detail.content ?? '';
  const payload = detail.payload ?? null;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const normalizedType = String(payload.type || payload.kind || '').trim().toLowerCase();
    if (normalizedType) {
      return { text: responseText, payload: { ...payload, type: normalizedType } };
    }
  }

  if (typeof responseText === 'string') {
    const trimmed = responseText.trim();
    if (!trimmed) {
      return { text: '', payload: null };
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const normalizedType = String(parsed.type || parsed.kind || '').trim().toLowerCase();
          if (normalizedType) {
            return { text: '', payload: { ...parsed, type: normalizedType } };
          }
        }
      } catch (error) {
        // Fall through to plain text
      }
    }
  }

  return { text: String(responseText || ''), payload: null };
}
