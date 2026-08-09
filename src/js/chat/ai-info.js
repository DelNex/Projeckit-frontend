import { get } from '../api/api-client.js';

let cache = null;
let inflight = null;

export async function fetchAiInfo(force = false) {
  if (!force && cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const body = await get('/ai/info');
      cache = body && typeof body === 'object' ? body : {};
    } catch (e) {
      cache = {};
    } finally {
      inflight = null;
    }
    return cache;
  })();

  return inflight;
}

export function getAiInfoSync() {
  return cache || { tools: [], toolCount: 0, session: {}, planner: {}, aiVersion: '' };
}

export function toolIndex(info) {
  const index = {};
  (info?.tools || []).forEach((t) => {
    index[t.id] = t;
  });
  return index;
}

export default { fetchAiInfo, getAiInfoSync, toolIndex };