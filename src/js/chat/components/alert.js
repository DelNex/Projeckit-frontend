export default function renderAlert(payload) {
  const { level = 'info', title, message } = payload || {};
  const wrapper = document.createElement('div');
  const toneClasses = {
    success: 'border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-400',
    warning: 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-400',
    error: 'border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400',
    info: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300'
  };
  wrapper.className = `ai-component ai-alert border ${toneClasses[level] || toneClasses.info}`;
  if (title) {
    const t = document.createElement('div');
    t.className = 'mb-1 font-semibold';
    t.textContent = title;
    wrapper.appendChild(t);
  }
  if (message) {
    const m = document.createElement('div');
    m.className = 'text-sm leading-6';
    m.textContent = message;
    wrapper.appendChild(m);
  }
  return wrapper;
}
