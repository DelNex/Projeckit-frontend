export default function renderMetric(payload) {
  const { title, value, delta, note } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-metric flex items-start justify-between gap-4 rounded-2xl border border-gray-200/70 bg-white/70 p-4 dark:border-gray-800 dark:bg-gray-900/70';

  const left = document.createElement('div');
  left.className = 'flex-1';
  if (title) {
    const t = document.createElement('div');
    t.className = 'text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400';
    t.textContent = title;
    left.appendChild(t);
  }
  if (value !== undefined && value !== null && value !== '') {
    const v = document.createElement('div');
    v.className = 'mt-1 text-2xl font-semibold text-gray-900 dark:text-white/90';
    v.textContent = value;
    left.appendChild(v);
  }
  if (note) {
    const n = document.createElement('div');
    n.className = 'mt-1 text-sm text-gray-500 dark:text-gray-400';
    n.textContent = note;
    left.appendChild(n);
  }
  wrapper.appendChild(left);

  if (delta !== undefined && delta !== null && delta !== '') {
    const d = document.createElement('div');
    d.className = `rounded-full px-2.5 py-1 text-sm font-semibold ${Number(delta) >= 0 ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400' : 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'}`;
    d.textContent = Number(delta) >= 0 ? `+${delta}` : String(delta);
    wrapper.appendChild(d);
  }

  return wrapper;
}
