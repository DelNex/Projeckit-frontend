export default function renderList(payload) {
  const { title, items = [], ordered = false } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-list';
  if (title) {
    const t = document.createElement('div');
    t.className = 'mb-2 text-sm font-semibold text-gray-900 dark:text-white/90';
    t.textContent = title;
    wrapper.appendChild(t);
  }
  const el = document.createElement(ordered ? 'ol' : 'ul');
  el.className = `space-y-2 ${ordered ? 'list-decimal pl-5' : 'list-disc pl-5'} text-sm leading-6 text-gray-700 dark:text-gray-300`;
  items.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'leading-6';
    li.textContent = typeof it === 'string' ? it : JSON.stringify(it);
    el.appendChild(li);
  });
  wrapper.appendChild(el);
  return wrapper;
}
