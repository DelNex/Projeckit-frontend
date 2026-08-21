/**
 * Rich Assistant Component Protocol Renderer
 * Renders structured assistant message parts (Actions, Confirmations, Progress, Results, Chips)
 * and handles UI visual target highlighting ([data-ai-target]), hover popups, and action bar (Copy, Redo, Like, Dislike) on all turns.
 */

import { parseMarkdownToHtml } from './markdown.js';

export function highlightUiTarget(targetQuery) {
  if (!targetQuery) return;

  const el = document.querySelector(targetQuery) || document.querySelector(`[data-ai-target="${targetQuery}"]`);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-4', 'ring-brand-500', 'ring-offset-2', 'animate-pulse');

  setTimeout(() => {
    el.classList.remove('ring-4', 'ring-brand-500', 'ring-offset-2', 'animate-pulse');
  }, 4000);
}

export function appendAssistantActionBar(messageContainer, textToCopy, onRedo) {
  if (!messageContainer || messageContainer.querySelector('.ai-message-action-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'ai-message-action-bar flex items-center gap-1.5 mt-2.5 pt-1 text-gray-400 dark:text-gray-500';
  bar.innerHTML = `
    <button type="button" class="btn-action-copy group relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition" title="Copy text">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Copy text</span>
    </button>
    <button type="button" class="btn-action-redo group relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition" title="Regenerate">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Regenerate</span>
    </button>
    <button type="button" class="btn-action-like group relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 transition" title="Good response">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2"/></svg>
      <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Good response</span>
    </button>
    <button type="button" class="btn-action-dislike group relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-500 transition" title="Bad response">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-9h2a2 2 0 012 2v6a2 2 0 01-2 2h-2"/></svg>
      <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Bad response</span>
    </button>
  `;

  // Copy action
  const copyBtn = bar.querySelector('.btn-action-copy');
  copyBtn?.addEventListener('click', () => {
    if (navigator.clipboard && textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      const tip = copyBtn.querySelector('span');
      if (tip) {
        tip.textContent = 'Copied!';
        setTimeout(() => { tip.textContent = 'Copy text'; }, 2000);
      }
    }
  });

  // Redo action
  const redoBtn = bar.querySelector('.btn-action-redo');
  redoBtn?.addEventListener('click', () => {
    if (onRedo) onRedo();
  });

  // Like action
  const likeBtn = bar.querySelector('.btn-action-like');
  likeBtn?.addEventListener('click', () => {
    likeBtn.classList.toggle('text-brand-500');
    const tip = likeBtn.querySelector('span');
    if (tip) tip.textContent = 'Thanks for feedback!';
  });

  // Dislike action
  const dislikeBtn = bar.querySelector('.btn-action-dislike');
  dislikeBtn?.addEventListener('click', () => {
    dislikeBtn.classList.toggle('text-red-500');
    const tip = dislikeBtn.querySelector('span');
    if (tip) tip.textContent = 'Feedback recorded';
  });

  messageContainer.appendChild(bar);
}

export function appendTurnFollowUpChips(messageContainer, pageId, onDispatchQuery) {
  if (!messageContainer || messageContainer.querySelector('.ai-turn-follow-up-bar')) return;

  const chipsMap = {
    'exam-import': [
      { label: 'How do I scan?', query: 'How do I scan student answer sheets?', color: 'bg-brand-500' },
      { label: 'Fix tilted sheet', query: 'My sheet wasn\'t detected by camera', color: 'bg-amber-500' },
      { label: 'Open verification', query: 'Open verification queue', color: 'bg-rose-500' },
      { label: 'What do I do here?', query: 'What do I do on the OMR page?', color: 'bg-indigo-500' },
    ],
    'item-analysis': [
      { label: 'Difficulty index (P)', query: 'Explain difficulty index P in item analysis', color: 'bg-brand-500' },
      { label: 'Discrimination (D)', query: 'Explain discrimination index D', color: 'bg-emerald-500' },
      { label: 'Items to revise', query: 'Which items need revision?', color: 'bg-amber-500' },
      { label: 'Explain this page', query: 'What do I do on this page?', color: 'bg-indigo-500' },
    ],
    'reports': [
      { label: 'Explain this report', query: 'Explain this quarterly performance report', color: 'bg-brand-500' },
      { label: 'Print this report', query: 'Can I print this report?', color: 'bg-emerald-500' },
      { label: 'Export results', query: 'How do I export section results?', color: 'bg-indigo-500' },
    ],
    'assessment-workspace': [
      { label: 'Generate test paper', query: 'How do I generate the test?', color: 'bg-brand-500' },
      { label: 'Check TOS', query: 'Check TOS competency hours allocation', color: 'bg-emerald-500' },
      { label: 'Manage Answer Key', query: 'How do I set the answer key?', color: 'bg-amber-500' },
      { label: 'Next step', query: 'What should I do next for this assessment?', color: 'bg-indigo-500' },
    ],
    'dashboard': [
      { label: 'Create an assessment', query: 'How do I create an assessment?', color: 'bg-brand-500' },
      { label: 'Review performance', query: 'Show overall performance this quarter', color: 'bg-emerald-500' },
      { label: 'Teach me Project KIT', query: 'I\'m new. Teach me how to use Project KIT.', color: 'bg-amber-500' },
      { label: 'Explain this page', query: 'What do I do on this page?', color: 'bg-indigo-500' },
    ],
  };

  const chips = chipsMap[pageId] || chipsMap['dashboard'];

  const bar = document.createElement('div');
  bar.className = 'ai-turn-follow-up-bar space-y-2 pt-3 mt-3 border-t border-gray-200/60 dark:border-gray-800/60';
  bar.innerHTML = `
    <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Page Quick Actions</div>
    <div class="flex flex-wrap gap-2 pt-1">
      ${chips
        .map(
          (c) => `
        <button type="button" class="ai-suggestion-chip group relative inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-200 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-xs" data-query="${c.query}">
          <span class="w-1.5 h-1.5 rounded-full ${c.color}"></span>
          <span>${c.label}</span>
          <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Click to execute</span>
        </button>
      `
        )
        .join('')}
    </div>
  `;

  bar.querySelectorAll('button[data-query]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      if (q && onDispatchQuery) onDispatchQuery(q);
    });
  });

  messageContainer.appendChild(bar);
}

export function renderRichPart(part = {}, onDispatchQuery, onTriggerAction) {
  const container = document.createElement('div');
  container.className = 'ai-rich-part my-2 space-y-2';

  switch (part.type) {
    case 'text': {
      container.className = 'ai-answer prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed';
      container.innerHTML = parseMarkdownToHtml(part.text || '');
      break;
    }

    case 'suggestions': {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-wrap gap-2 pt-1';
      (part.items || []).forEach((chip) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'ai-suggestion-chip group relative inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 text-gray-800 dark:text-gray-200 hover:border-brand-500 hover:text-brand-600 transition shadow-xs';
        btn.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          <span>${chip.label}</span>
          <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Click to execute</span>
        `;
        btn.addEventListener('click', () => {
          if (onDispatchQuery) onDispatchQuery(chip.prompt);
        });
        wrap.appendChild(btn);
      });
      container.appendChild(wrap);
      break;
    }

    case 'action': {
      const act = part.action;
      if (!act) break;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'group relative px-4 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs transition flex items-center gap-2';
      btn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        <span>${act.label}</span>
        <span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-9999 font-normal pointer-events-none">Perform Action</span>
      `;
      btn.addEventListener('click', () => {
        if (act.type === 'focus') highlightUiTarget(act.target);
        else if (act.type === 'activate-tab') {
          const tabBtn = document.querySelector(`[data-tab="${act.target}"]`);
          if (tabBtn) tabBtn.click();
        } else if (act.type === 'navigate') {
          window.location.href = act.target;
        }
        if (onTriggerAction) onTriggerAction(act);
      });
      container.appendChild(btn);
      break;
    }

    case 'confirmation': {
      const c = part.confirmation;
      if (!c) break;
      const isDestructive = c.riskLevel === 'destructive' || c.riskLevel === 'mutation';
      const borderClass = isDestructive
        ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
        : 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20';

      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border-2 ${borderClass} space-y-3`;
      card.innerHTML = `
        <div class="flex items-start gap-2.5">
          <div class="p-1.5 rounded-lg ${isDestructive ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600'} shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <h4 class="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">${c.title}</h4>
            <p class="text-xs text-gray-600 dark:text-gray-300 mt-1">${c.description}</p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
          <button type="button" class="btn-cancel px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-lg transition">${c.cancelLabel || 'Cancel'}</button>
          <button type="button" class="btn-confirm px-3 py-1.5 text-xs font-semibold text-white ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-600'} rounded-lg shadow-xs transition">${c.confirmLabel || 'Confirm'}</button>
        </div>
      `;

      card.querySelector('.btn-confirm')?.addEventListener('click', () => {
        card.innerHTML = `<p class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Action Confirmed — Executing request...</p>`;
        if (onDispatchQuery) onDispatchQuery(`Confirm: ${c.action}`);
      });
      card.querySelector('.btn-cancel')?.addEventListener('click', () => {
        card.innerHTML = `<p class="text-xs text-gray-400">Action cancelled.</p>`;
      });
      container.appendChild(card);
      break;
    }

    case 'progress': {
      const p = part.progress;
      if (!p) break;
      const card = document.createElement('div');
      card.className = 'p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2';
      const pct = p.progress !== undefined ? p.progress : 50;
      card.innerHTML = `
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-gray-900 dark:text-white">${p.title}</span>
          <span class="text-gray-400 font-mono">${pct}%</span>
        </div>
        <div class="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-brand-500 transition-all duration-300" style="width: ${pct}%"></div>
        </div>
        <p class="text-[11px] text-gray-500 dark:text-gray-400">${p.status}</p>
      `;
      container.appendChild(card);
      break;
    }

    case 'result': {
      const r = part.result;
      if (!r) break;
      const card = document.createElement('div');
      card.className = 'p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3';
      const metricsHtml = (r.metrics || [])
        .map(
          (m) => `
        <div class="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-center border border-gray-100 dark:border-gray-800">
          <span class="block text-[10px] uppercase font-bold text-gray-400">${m.label}</span>
          <span class="block text-sm font-extrabold text-brand-600 dark:text-brand-400 mt-0.5">${m.value}</span>
        </div>
      `
        )
        .join('');
      card.innerHTML = `
        <h4 class="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">${r.title}</h4>
        <div class="grid grid-cols-2 gap-2">${metricsHtml}</div>
      `;
      container.appendChild(card);
      break;
    }

    case 'help': {
      const h = part.help;
      if (!h) break;
      const card = document.createElement('div');
      card.className = 'p-4 bg-brand-50/60 dark:bg-brand-900/15 rounded-xl border border-brand-200 dark:border-brand-900 space-y-2 text-xs';
      card.innerHTML = `
        <h4 class="font-bold text-brand-700 dark:text-brand-300">You are on: ${h.pageTitle}</h4>
        <p class="text-gray-600 dark:text-gray-300">${h.overview}</p>
        <div class="pt-2 border-t border-brand-200 dark:border-brand-900 space-y-1 font-semibold text-gray-700 dark:text-gray-200">
          <p>👉 <strong>First step:</strong> ${h.firstStep}</p>
          <p>⏩ <strong>Next step:</strong> ${h.nextStep}</p>
        </div>
      `;
      container.appendChild(card);
      break;
    }

    case 'error': {
      const err = part.error;
      if (!err) break;
      const card = document.createElement('div');
      card.className = 'p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900 space-y-2 text-xs text-red-600 dark:text-red-400';
      card.innerHTML = `
        <h4 class="font-bold uppercase tracking-wider">${err.title || 'Error'}</h4>
        <p>${err.description}</p>
      `;
      if (err.retryPrompt) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mt-2 px-3 py-1 bg-red-600 text-white rounded-lg text-[11px] font-semibold hover:bg-red-700 transition';
        btn.textContent = 'Retry Action';
        btn.addEventListener('click', () => {
          if (onDispatchQuery) onDispatchQuery(err.retryPrompt);
        });
        card.appendChild(btn);
      }
      container.appendChild(card);
      break;
    }

    default:
      break;
  }

  return container;
}
