export default function renderEmpty(payload) {
  const { message = 'No results' } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-empty rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400';
  const m = document.createElement('div');
  m.className = 'font-medium';
  m.textContent = message;
  wrapper.appendChild(m);
  return wrapper;
}
