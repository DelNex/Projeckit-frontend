export default function renderAccordion(payload) {
  const { title, items = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-accordion';

  if (title) {
    const heading = document.createElement('div');
    heading.className = 'ai-component-title';
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  items.forEach((item) => {
    const section = document.createElement('div');
    section.className = 'ai-accordion-section rounded-xl border border-gray-200/70 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-900/70';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-accordion-trigger flex w-full items-center justify-between text-left text-sm font-semibold text-gray-900 dark:text-white/90';
    const label = document.createElement('span');
    label.textContent = item.title || 'Section';
    button.appendChild(label);
    const chevron = document.createElement('span');
    chevron.className = 'text-xs text-gray-500 transition-transform dark:text-gray-400';
    chevron.textContent = '▾';
    button.appendChild(chevron);
    button.addEventListener('click', () => {
      const content = button.nextElementSibling;
      if (content) {
        content.classList.toggle('hidden');
        chevron.classList.toggle('rotate-180');
      }
    });

    const content = document.createElement('div');
    content.className = 'ai-accordion-content mt-2 hidden text-sm leading-6 text-gray-700 dark:text-gray-300';
    content.textContent = item.content || item.body || '';

    section.appendChild(button);
    section.appendChild(content);
    wrapper.appendChild(section);
  });

  return wrapper;
}
