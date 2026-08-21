export default function renderSectionSummary(payload) {
  const { title, subtitle, items = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-section-summary';

  if (title) {
    const h = document.createElement('div');
    h.className = 'ai-component-title';
    h.textContent = title;
    wrapper.appendChild(h);
  }

  if (subtitle) {
    const s = document.createElement('div');
    s.className = 'mb-3 text-sm text-gray-500 dark:text-gray-400';
    s.textContent = subtitle;
    wrapper.appendChild(s);
  }

  const grid = document.createElement('div');
  grid.className = 'grid gap-2 sm:grid-cols-2';
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'rounded-2xl border border-gray-200/70 bg-white/70 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/70';

    const label = document.createElement('div');
    label.className = 'text-[11px] uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400';
    label.textContent = item.label || 'Metric';
    card.appendChild(label);

    const value = document.createElement('div');
    value.className = 'mt-1 text-lg font-semibold text-gray-900 dark:text-white/90';
    value.textContent = item.value ?? '—';
    card.appendChild(value);

    if (item.note) {
      const note = document.createElement('div');
      note.className = 'mt-1 text-xs text-gray-500 dark:text-gray-400';
      note.textContent = item.note;
      card.appendChild(note);
    }

    grid.appendChild(card);
  });

  wrapper.appendChild(grid);
  return wrapper;
}
