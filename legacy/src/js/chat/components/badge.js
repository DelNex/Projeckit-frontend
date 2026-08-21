export default function renderBadge(payload) {
  const { title, value, tone = 'neutral', subtitle } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-badge flex flex-wrap items-center gap-2';

  const pill = document.createElement('span');
  pill.className = `ai-pill ai-pill-${tone}`;
  pill.textContent = title || value || 'Badge';
  wrapper.appendChild(pill);

  if (subtitle) {
    const sub = document.createElement('span');
    sub.className = 'text-sm text-gray-500 dark:text-gray-400';
    sub.textContent = subtitle;
    wrapper.appendChild(sub);
  }

  return wrapper;
}
