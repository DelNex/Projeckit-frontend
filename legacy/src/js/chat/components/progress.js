export default function renderProgress(payload) {
  const { title, value = 0, max = 100, subtitle } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-progress';
  if (title) {
    const t = document.createElement('div');
    t.className = 'mb-1 flex items-center justify-between';
    const label = document.createElement('span');
    label.className = 'text-sm font-semibold text-gray-900 dark:text-white/90';
    label.textContent = title;
    const pct = document.createElement('span');
    pct.className = 'text-sm font-medium text-brand-500';
    pct.textContent = `${Math.round((Number(value) / Number(max)) * 100)}%`;
    t.appendChild(label);
    t.appendChild(pct);
    wrapper.appendChild(t);
  }
  if (subtitle) {
    const sub = document.createElement('div');
    sub.className = 'mb-2 text-sm text-gray-500 dark:text-gray-400';
    sub.textContent = subtitle;
    wrapper.appendChild(sub);
  }
  const barBg = document.createElement('div');
  barBg.className = 'h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800';
  const bar = document.createElement('div');
  const pct = Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
  bar.style.width = `${pct}%`;
  bar.className = 'h-3 rounded-full bg-gradient-to-r from-brand-500 to-blue-light-500';
  barBg.appendChild(bar);
  wrapper.appendChild(barBg);
  return wrapper;
}
