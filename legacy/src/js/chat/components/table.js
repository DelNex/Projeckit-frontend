export default function renderTable(payload) {
  const { title, columns = [], rows = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-table overflow-hidden rounded-2xl border border-gray-200/70 bg-white/80 p-2 dark:border-gray-800 dark:bg-gray-900/70';

  if (title) {
    const h = document.createElement('div');
    h.className = 'ai-component-title px-2 pt-1';
    h.textContent = title;
    wrapper.appendChild(h);
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'overflow-x-auto';
  const table = document.createElement('table');
  table.className = 'min-w-full text-sm';

  if (columns.length) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.className = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400';
      th.textContent = col;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-gray-200/80 bg-white/40 dark:border-gray-800 dark:bg-gray-900/30';
    r.forEach((cell) => {
      const td = document.createElement('td');
      td.className = 'px-3 py-2 text-sm text-gray-700 dark:text-gray-300';
      td.textContent = cell === null || cell === undefined ? '' : String(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  tableWrap.appendChild(table);
  wrapper.appendChild(tableWrap);
  return wrapper;
}
