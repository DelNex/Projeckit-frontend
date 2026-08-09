export default function renderMarkdown(payload) {
  const { content = '', title } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-markdown space-y-2';

  if (title) {
    const heading = document.createElement('div');
    heading.className = 'ai-component-title text-base font-bold text-gray-900 dark:text-white mb-2';
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  const body = document.createElement('div');
  body.className = 'ai-component-body text-sm leading-relaxed text-gray-700 dark:text-gray-200 space-y-2';
  body.innerHTML = parseMarkdownToHtml(content || '');
  wrapper.appendChild(body);
  return wrapper;
}

export function parseMarkdownToHtml(text) {
  if (!text) return '';
  
  let html = String(text);

  // Fenced Code Blocks (```lang ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div class="my-3 overflow-hidden rounded-xl border border-gray-800 bg-slate-950 p-3 font-mono text-xs text-slate-100 shadow-sm"><div class="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">${lang || 'code'}</div><pre class="overflow-x-auto whitespace-pre-wrap"><code>${escapeHtml(code.trim())}</code></pre></div>`;
  });

  // Headers (### Heading, ## Heading, # Heading)
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-gray-900 dark:text-white mt-3 mb-1">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-gray-900 dark:text-white mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-lg font-extrabold text-gray-900 dark:text-white mt-4 mb-2">$1</h1>');

  // Blockquotes (> Quote)
  html = html.replace(/^> (.*$)/gim, '<blockquote class="my-2 border-l-4 border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 px-3 py-2 text-xs italic text-gray-700 dark:text-gray-300 rounded-r-lg">$1</blockquote>');

  // Bold & Italic (**bold**, *italic*)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-white">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

  // Inline Code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">$1</code>');

  // Unordered Lists (- Item or * Item)
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="flex items-start gap-2 text-xs leading-relaxed"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"></span><span>$1</span></li>');
  html = html.replace(/(<li.*?>.*?<\/li>\n?)+/g, '<ul class="my-2 space-y-1.5 pl-1">$&</ul>');

  // Paragraph breaks / newlines
  html = html.replace(/\n\n/g, '</p><p class="mt-2">');
  html = html.replace(/\n/g, '<br />');

  return html;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
