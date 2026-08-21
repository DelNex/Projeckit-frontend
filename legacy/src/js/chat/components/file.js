export default function renderFile(payload) {
  const { name, url, size } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-file flex items-center gap-3 rounded-2xl border border-gray-200/70 bg-white/80 p-3 dark:border-gray-800 dark:bg-gray-900/70';
  const icon = document.createElement('div');
  icon.className = 'flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg dark:bg-brand-500/10';
  icon.textContent = '📄';
  wrapper.appendChild(icon);
  const meta = document.createElement('div');
  meta.className = 'flex-1';
  const title = document.createElement('div');
  title.className = 'text-sm font-semibold text-gray-900 dark:text-white/90';
  title.textContent = name || (url ? url.split('/').pop() : 'file');
  meta.appendChild(title);
  if (size) {
    const s = document.createElement('div');
    s.className = 'text-xs text-gray-500 dark:text-gray-400';
    s.textContent = size;
    meta.appendChild(s);
  }
  wrapper.appendChild(meta);
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300';
    a.textContent = 'Download';
    wrapper.appendChild(a);
  }
  return wrapper;
}
