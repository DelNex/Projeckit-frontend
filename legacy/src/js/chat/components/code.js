export default function renderCode(payload) {
  const { language = '', code = '' } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-code overflow-hidden rounded-2xl border border-gray-200/70 bg-slate-950/95 p-3 dark:border-gray-800';
  if (language) {
    const lang = document.createElement('div');
    lang.className = 'mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400';
    lang.textContent = language;
    wrapper.appendChild(lang);
  }
  const pre = document.createElement('pre');
  pre.className = 'overflow-auto rounded-xl bg-slate-900/90 p-3 text-sm text-slate-100';
  const codeEl = document.createElement('code');
  codeEl.className = 'whitespace-pre-wrap break-words';
  codeEl.textContent = code || '';
  pre.appendChild(codeEl);
  wrapper.appendChild(pre);
  return wrapper;
}
