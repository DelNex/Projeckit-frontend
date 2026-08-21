export default function renderImage(payload) {
  const { src, alt = '', caption } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-image overflow-hidden rounded-2xl border border-gray-200/70 bg-white/70 p-2 dark:border-gray-800 dark:bg-gray-900/70';
  const img = document.createElement('img');
  img.src = src || '';
  img.alt = alt || 'image';
  img.className = 'max-h-72 w-full rounded-xl object-cover';
  wrapper.appendChild(img);
  if (caption) {
    const c = document.createElement('div');
    c.className = 'mt-2 text-sm text-gray-500 dark:text-gray-400';
    c.textContent = caption;
    wrapper.appendChild(c);
  }
  return wrapper;
}
