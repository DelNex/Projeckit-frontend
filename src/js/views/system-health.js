// System Health View — live backend & Redis status checks
const BASE = typeof process !== 'undefined' && process.env && process.env.API_BASE_URL
  ? process.env.API_BASE_URL
  : window.location.origin;

function setStatus(el, ok, label) {
  if (!el) return;
  el.textContent = label;
  el.className = ok
    ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400';
}

function setLatency(el, ms) {
  if (!el) return;
  el.textContent = ms != null ? `${Math.max(0, Math.round(ms))} ms` : '—';
}

async function checkHealth(url) {
  const started = performance.now();
  const res = await fetch(url, { credentials: 'include' });
  const payload = await res.json().catch(() => null);
  return {
    ok: res.ok,
    latency: performance.now() - started,
    payload: payload || {},
  };
}

function renderOverall(statuses) {
  const dot = document.getElementById('health-overall-dot');
  const title = document.getElementById('health-overall-title');
  const detail = document.getElementById('health-overall-detail');
  if (!dot) return;

  const checks = [
    { key: 'api', ok: statuses.api?.ok },
    { key: 'redis', ok: statuses.redis?.ok },
  ];
  const allOk = checks.every((c) => c.ok === true);
  const anyChecked = checks.some((c) => c.ok != null);

  if (!anyChecked) {
    dot.className = 'h-3 w-3 rounded-full bg-rose-500';
    if (title) title.textContent = 'Services unavailable';
    if (detail) detail.textContent = 'Could not reach the backend health endpoints. Check that the backend is running.';
    return;
  }

  dot.className = allOk ? 'h-3 w-3 rounded-full bg-emerald-500' : 'h-3 w-3 rounded-full bg-amber-500';
  if (title) title.textContent = allOk ? 'All systems operational' : 'Some services degraded';
  if (detail) {
    const parts = checks.map((c) => `${c.key}: ${c.ok ? 'ok' : 'down'}`);
    detail.textContent = parts.join(' · ');
  }
}

export async function initSystemHealthView() {
  const refresh = async () => {
    const apiStatusEl = document.getElementById('health-api-status');
    const redisStatusEl = document.getElementById('health-redis-status');

    setStatus(apiStatusEl, false, 'Checking…');
    setStatus(redisStatusEl, false, 'Checking…');
    apiStatusEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    redisStatusEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

    const statuses = {};

    try {
      const api = await checkHealth(`${BASE.replace(/\/+$/, '')}/health`);
      statuses.api = api;
      setStatus(apiStatusEl, api.ok, api.ok ? 'Operational' : 'Unreachable');
      setLatency(document.getElementById('health-api-latency'), api.latency);
    } catch (e) {
      statuses.api = { ok: false };
      setStatus(apiStatusEl, false, 'Unreachable');
    }

    try {
      const redis = await checkHealth(`${BASE.replace(/\/+$/, '')}/health/redis`);
      statuses.redis = redis;
      const redisOk = redis.ok && redis.payload?.redis === true;
      setStatus(redisStatusEl, redisOk, redisOk ? 'Connected' : 'Degraded');
      setLatency(document.getElementById('health-redis-latency'), redis.latency);
    } catch (e) {
      statuses.redis = { ok: false };
      setStatus(redisStatusEl, false, 'Unreachable');
    }

    renderOverall(statuses);
  };

  document.getElementById('btn-refresh-health')?.addEventListener('click', refresh);
  await refresh();
}