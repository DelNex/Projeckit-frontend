export default function renderStatistics(payload) {
  const { title, items = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-statistics';

  if (title) {
    const heading = document.createElement('div');
    heading.className = 'ai-component-title';
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  const grid = document.createElement('div');
  grid.className = 'ai-stats-grid';
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'ai-card ai-stat-card rounded-2xl border border-gray-200/70 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-900/70';
    const label = document.createElement('div');
    label.className = 'text-[11px] uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400';
    label.textContent = item.label || 'Metric';
    const value = document.createElement('div');
    value.className = 'mt-1 text-lg font-semibold text-gray-900 dark:text-white/90';
    value.textContent = item.value || item.amount || '';
    card.appendChild(label);
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
