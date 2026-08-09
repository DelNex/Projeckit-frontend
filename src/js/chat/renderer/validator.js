export function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const type = String(payload.type || payload.kind || '').trim().toLowerCase();
  return Boolean(type);
}

export function normalizePayload(payload) {
  if (!isValidPayload(payload)) return null;
  return { ...payload, type: String(payload.type || payload.kind || '').trim().toLowerCase() };
}
