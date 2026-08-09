export default function renderText(payload) {
  const { title, text } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-text';

  if (title) {
    const heading = document.createElement('div');
    heading.className = 'ai-component-title';
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  const body = document.createElement('div');
  body.className = 'ai-component-body whitespace-pre-wrap';
  body.textContent = text || '';
  wrapper.appendChild(body);

  return wrapper;
}
