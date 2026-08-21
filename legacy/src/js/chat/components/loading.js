export default function renderLoading(payload) {
  const { message = 'Loading…' } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-loading flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-brand-50/70 px-4 py-3 text-sm text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300';
  const spinner = document.createElement('div');
  spinner.className = 'h-5 w-5 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500';
  wrapper.appendChild(spinner);
  const m = document.createElement('div');
  m.className = 'font-medium';
  m.textContent = message;
  wrapper.appendChild(m);
  return wrapper;
}
