export default function renderCard(payload) {
  const { title, subtitle, body, image, actions = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-card rounded-2xl border border-gray-200/70 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = title || 'card-image';
    img.className = 'mb-3 h-36 w-full rounded-xl object-cover';
    wrapper.appendChild(img);
  }
  if (title) {
    const h = document.createElement('div');
    h.className = 'text-base font-semibold text-gray-900 dark:text-white/90';
    h.textContent = title;
    wrapper.appendChild(h);
  }
  if (subtitle) {
    const s = document.createElement('div');
    s.className = 'mb-2 text-sm text-gray-500 dark:text-gray-400';
    s.textContent = subtitle;
    wrapper.appendChild(s);
  }
  if (body) {
    const b = document.createElement('div');
    b.className = 'text-sm leading-6 text-gray-600 dark:text-gray-300';
    b.textContent = body;
    wrapper.appendChild(b);
  }

  if (actions && actions.length) {
    const row = document.createElement('div');
    row.className = 'mt-3 flex flex-wrap gap-2';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300';
      btn.textContent = a.label || 'Action';
      if (a.url) btn.addEventListener('click', () => window.open(a.url, '_blank'));
      row.appendChild(btn);
    });
    wrapper.appendChild(row);
  }

  return wrapper;
}
