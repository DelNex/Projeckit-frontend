import { softNavigate } from './pjax.js';

const COMMANDS = [
  { id: 'theme', label: 'Toggle dark mode', keywords: ['dark mode', 'theme', 'night', 'light'], run: () => document.getElementById('btn-theme-toggle')?.click() },
  { id: 'ai', label: 'Open AI assistant', keywords: ['ai', 'assistant', 'chat', 'help'], run: () => document.getElementById('btn-open-ai-modal')?.click() },
  { id: 'notifications', label: 'Open notifications', keywords: ['notifications', 'alerts', 'bell'], run: () => document.getElementById('btn-notifications')?.click() },
  { id: 'signout', label: 'Sign out', keywords: ['logout', 'sign out', 'exit'], run: () => document.getElementById('btn-sign-out')?.click() },
];

let searchIndex = null;
let overlay = null;
let results = [];
let activeIdx = -1;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function highlight(text, tokens) {
  let out = esc(text);
  const lower = text.toLowerCase();
  let firstIdx = -1;
  let len = 0;
  tokens.forEach((t) => {
    const i = lower.indexOf(t);
    if (i >= 0 && (firstIdx === -1 || i < firstIdx)) { firstIdx = i; len = t.length; }
  });
  if (firstIdx < 0) return out;
  const start = Math.max(0, firstIdx - 40);
  const end = Math.min(text.length, firstIdx + len + 60);
  let snippet = esc((start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''));
  tokens.forEach((t) => {
    snippet = snippet.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="bg-amber-200 dark:bg-amber-500/30 text-inherit">$1</mark>');
  });
  return snippet;
}

function tokenize(q) {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

function scoreEntry(entry, tokens) {
  let score = 0;
  const title = entry.title.toLowerCase();
  const headings = entry.headings.join(' ').toLowerCase();
  const text = entry.text.toLowerCase();
  const keywords = entry.keywords.join(' ').toLowerCase();

  tokens.forEach((t) => {
    if (title.includes(t)) score += 8;
    if (title.startsWith(t)) score += 4;
    if (headings.includes(t)) score += 3;
    if (keywords.includes(t)) score += 3;
    if (text.includes(t)) score += 1;
  });
  // consecutive-token bonus: full query appears in title/headings
  const q = tokens.join(' ');
  if (title.includes(q)) score += 10;
  if (headings.includes(q)) score += 5;
  return score;
}

function scoreCommand(cmd, tokens) {
  const hay = `${cmd.label} ${cmd.keywords.join(' ')}`.toLowerCase();
  let score = tokens.reduce((s, t) => s + (hay.includes(t) ? 5 : 0), 0);
  if (cmd.label.toLowerCase().includes(tokens.join(' '))) score += 6;
  return score;
}

function runSearch(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const commandMode = query.trim().startsWith('>');

  const pageResults = (searchIndex || [])
    .map((entry) => ({ type: 'page', entry, score: scoreEntry(entry, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const commandResults = commandMode ? COMMANDS : COMMANDS.slice(0, 6)
    .map((cmd) => ({ type: 'command', entry: cmd, score: scoreCommand(cmd, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return [...commandResults, ...pageResults].slice(0, 12);
}

function render() {
  if (!overlay) return;
  const listEl = overlay.querySelector('#gs-results');
  activeIdx = -1;
  const input = overlay.querySelector('#gs-input');

  if (!input.value.trim()) {
    listEl.innerHTML = `<div class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Type to search pages, content, or commands. Try “students”, “mps”, or “> dark”.</div>`;
    return;
  }

  results = runSearch(input.value);
  if (!results.length) {
    listEl.innerHTML = `<div class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No results for “${esc(input.value)}”.</div>`;
    return;
  }

  listEl.innerHTML = results.map((r, i) => {
    if (r.type === 'command') {
      return `<button data-idx="${i}" class="gs-item flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800">
        <span class="text-gray-400 dark:text-gray-500">⚙</span>
        <span class="font-medium text-gray-900 dark:text-white">${esc(r.entry.label)}</span>
        <span class="ml-auto text-xs text-gray-400">command</span>
      </button>`;
    }
    const entry = r.entry;
    const tokens = tokenize(input.value);
    const caption = entry.headings[0] || entry.title;
    return `<button data-idx="${i}" class="gs-item flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800">
        <span class="flex items-center gap-3">
          <span class="text-gray-400 dark:text-gray-500">→</span>
          <span class="font-medium text-gray-900 dark:text-white">${esc(entry.title)}</span>
          <span class="ml-auto text-xs text-gray-400">${esc(entry.url)}</span>
        </span>
        <span class="pl-8 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">${highlight(entry.text || caption, tokens)}</span>
      </button>`;
  }).join('');

  listEl.querySelectorAll('.gs-item').forEach((btn) => {
    btn.addEventListener('click', () => activate(Number(btn.dataset.idx)));
  });
  setActive(0);
}

function setActive(idx) {
  if (!overlay) return;
  const items = overlay.querySelectorAll('.gs-item');
  if (!items.length) return;
  activeIdx = (idx + items.length) % items.length;
  items.forEach((el, i) => {
    el.classList.toggle('bg-brand-50', i === activeIdx);
    el.classList.toggle('dark:bg-brand-900/20', i === activeIdx);
  });
  items[activeIdx]?.scrollIntoView({ block: 'nearest' });
}

function activate(idx) {
  const r = results[idx];
  if (!r) return;
  close();
  if (r.type === 'command') {
    const cmd = COMMANDS.find((c) => c.id === r.entry.id);
    if (cmd) cmd.run();
    return;
  }
  const url = new URL(r.entry.url, window.location.origin);
  softNavigate(url);
}

function close() {
  if (!overlay) return;
  overlay.classList.add('hidden');
  const input = overlay.querySelector('#gs-input');
  input.blur();
}

function open(initialQuery = '') {
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const input = overlay.querySelector('#gs-input');
  input.value = initialQuery;
  input.focus();
  render();
}

function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'global-search-overlay';
  overlay.className = 'hidden fixed inset-0 z-[100000] flex items-start justify-center bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm p-4 pt-[10vh]';
  overlay.innerHTML = `
    <div class="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
      <div class="flex items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
        <span class="text-gray-400">🔍</span>
        <input id="gs-input" type="text" autocomplete="off" placeholder="Search pages, content, or commands…  (prefix with > for commands)"
          class="h-14 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-hidden dark:text-white dark:placeholder:text-white/30"/>
        <kbd class="rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-gray-700">esc</kbd>
      </div>
      <div id="gs-results" class="max-h-[50vh] overflow-y-auto py-2 custom-scrollbar"></div>
    </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const input = overlay.querySelector('#gs-input');
  input.addEventListener('input', () => render());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(activeIdx >= 0 ? activeIdx : 0); }
    else if (e.key === 'Escape') { close(); }
  });
  document.body.appendChild(overlay);
}

export async function initGlobalSearch() {
  ensureOverlay();

  try {
    const res = await fetch('/search-index.json', { credentials: 'same-origin' });
    if (res.ok) searchIndex = await res.json();
  } catch (e) {
    console.warn('[GlobalSearch] index unavailable', e);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      overlay.classList.contains('hidden') ? open() : close();
    }
  });

  document.getElementById('search-button')?.addEventListener('click', () => {
    open();
  });

  // Group/page header search inputs on non-table pages open the palette too
  document.addEventListener('focusin', (e) => {
    if (e.target.id === 'search-input' && !document.querySelector('#students-table, #exam-table, .data-table')) {
      if (overlay && overlay.classList.contains('hidden')) open();
    }
  });
}