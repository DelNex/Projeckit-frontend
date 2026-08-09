export default function renderTimeline(payload) {
  const { title, items = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-timeline';

  if (title) {
    const heading = document.createElement('div');
    heading.className = 'ai-component-title';
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  const list = document.createElement('ol');
  list.className = 'ai-timeline-list';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'ai-timeline-item rounded-xl border border-gray-200/70 bg-white/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/70';

    const dot = document.createElement('span');
    dot.className = 'ai-timeline-dot';
    li.appendChild(dot);

    const body = document.createElement('div');
    body.className = 'ai-timeline-body';
    const label = document.createElement('div');
    label.className = 'text-sm font-semibold text-gray-900 dark:text-white/90';
    label.textContent = item.label || item.title || 'Item';
    body.appendChild(label);

    if (item.description || item.value) {
      const desc = document.createElement('div');
      desc.className = 'mt-0.5 text-sm text-gray-500 dark:text-gray-400';
      desc.textContent = item.description || item.value;
      body.appendChild(desc);
    }

    li.appendChild(body);
    list.appendChild(li);
  });

  wrapper.appendChild(list);
  return wrapper;
}
