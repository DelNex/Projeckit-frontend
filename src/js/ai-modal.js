import '@loquix/core';
import '@loquix/core/tokens/variables.css';
import { renderAIComponent } from './chat/renderer/renderer.js';
import { parseAIResponse } from './chat/renderer/parser.js';
import { parseMarkdownToHtml } from './chat/components/markdown.js';
import { normalizeAiResponse } from './chat/pipeline/normalize.js';
import { renderStageTracker } from './chat/pipeline/stages.js';
import { fetchAiInfo, getAiInfoSync, toolIndex } from './chat/ai-info.js';
import { buildSidebar, AI_SIDEBAR_OPEN_EVENT, AI_DEBUG_TOGGLE_EVENT } from './chat/sidebar.js';
import { renderDebugPanel, isDebugOpen, setDebugOpen } from './chat/debug-panel.js';
import { recordExecution, recordConversation, isDevMode, setDevMode } from './chat/session-store.js';
import { AiApi } from './api/index.js';

const AI_RESPONSE_EVENT = 'deped_ai_response';
const AI_MODAL_OPEN_EVENT = 'deped_open_ai_modal';
const AI_MODAL_OPENED = 'deped_ai_modal_opened';
const AI_MODAL_CLOSED = 'deped_ai_modal_closed';

let lastSession = null;

function createMessageId() {
  return `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessageElement({ role, text, messageId, status = 'complete', isHtml = false }) {
  const messageItem = document.createElement('loquix-message-item');
  messageItem.setAttribute('sender', role === 'user' ? 'user' : 'assistant');
  messageItem.setAttribute('show-avatar', '');
  if (messageId) messageItem.setAttribute('message-id', messageId);
  if (status && status !== 'complete') messageItem.setAttribute('status', status);

  const messageContent = document.createElement('loquix-message-content');
  if (isHtml) messageContent.innerHTML = text;
  else messageContent.textContent = text;
  messageItem.appendChild(messageContent);
  return messageItem;
}

function getAIModalElements() {
  const modal = document.getElementById('ai-modal');
  const container = modal?.querySelector('loquix-chat-container');
  const messageList = modal?.querySelector('loquix-message-list');
  const composer = modal?.querySelector('loquix-chat-composer');
  return { modal, container, messageList, composer };
}

function applyAIModalTheme(container, isDark) {
  if (!container) return;
  const modal = container.closest('#ai-modal');
  const theme = isDark ? 'dark' : 'light';
  container.classList.toggle('loquix-theme-dark', isDark);
  container.classList.toggle('loquix-theme-light', !isDark);
  container.setAttribute('data-theme', theme);
  if (modal) modal.setAttribute('data-theme', theme);
}

function scrollToBottom(messageList) {
  if (typeof messageList?.scrollToBottom === 'function') messageList.scrollToBottom('instant');
}

function appendAssistantReply(messageList, text, status = 'complete', messageId, isHtml = false) {
  const item = createMessageElement({ role: 'assistant', text, messageId, status, isHtml });
  messageList.appendChild(item);
  scrollToBottom(messageList);
  return item;
}

function appendUserMessage(messageList, text) {
  const item = createMessageElement({ role: 'user', text, messageId: createMessageId(), status: 'complete', isHtml: false });
  messageList.appendChild(item);
  scrollToBottom(messageList);
  return item;
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('overflow-hidden');
  window.dispatchEvent(new CustomEvent(AI_MODAL_OPENED, { detail: { timestamp: new Date().toISOString() } }));
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('overflow-hidden');
  window.dispatchEvent(new CustomEvent(AI_MODAL_CLOSED, { detail: { timestamp: new Date().toISOString() } }));
}

function findMessage(messageList, messageId) {
  return messageList?.querySelector(`loquix-message-item[message-id="${messageId}"]`) || null;
}

function replaceContent(target, node) {
  if (!target) return;
  target.removeAttribute('status');
  const contentNode = target.querySelector('loquix-message-content');
  if (contentNode) {
    contentNode.innerHTML = '';
    if (node) contentNode.appendChild(node);
  } else if (node) {
    target.appendChild(node);
  }
}

function renderExecutionInto(target, messageList, session, info) {
  lastSession = session;
  const payload = { type: 'ai-execution', session, toolMeta: toolIndex(info) };
  const node = renderAIComponent(payload);
  const contentNode = target?.querySelector?.('loquix-message-content');

  if (!target || !contentNode) {
    const wrapperItem = createMessageElement({ role: 'assistant', text: '', status: 'complete', isHtml: false });
    const c = wrapperItem.querySelector('loquix-message-content');
    if (c) c.appendChild(node);
    messageList.appendChild(wrapperItem);
    scrollToBottom(messageList);
    if (isDevMode() && isDebugOpen()) wrapperItem.querySelector('loquix-message-content')?.appendChild(renderDebugPanel(session));
    return wrapperItem;
  }

  replaceContent(target, node);
  if (isDevMode() && isDebugOpen()) {
    const c = target.querySelector('loquix-message-content');
    if (c) c.appendChild(renderDebugPanel(session));
  }
  scrollToBottom(messageList);
  return target;
}

function renderText(into, messageList, text) {
  if (!into) {
    appendAssistantReply(messageList, parseMarkdownToHtml(text), 'complete', null, true);
    return;
  }
  replaceContent(into, null);
  const contentNode = into?.querySelector?.('loquix-message-content');
  if (contentNode) contentNode.innerHTML = parseMarkdownToHtml(text);
  scrollToBottom(messageList);
}

function detectUserError(error) {
  const label = error && typeof error === 'object' ? error : {};
  const status = Number(label.status || 0);
  const message = String(label.message || label.error || '');
  if (status === 403 || /permission/i.test(message)) {
    return 'Permission denied. Your role cannot run this AI request.';
  }
  if (status === 404 || /not found/i.test(message)) {
    return 'No academic data was found for that request.';
  }
  if (status >= 500 || /server/i.test(message)) {
    return 'The AI server could not complete the request. Please try again.';
  }
  return message || 'The assistant could not complete that request.';
}

const WELCOME_QUERIES = [
  { label: 'Show Class Sectional MPS', query: 'Show Class Sectional MPS achievement comparison', color: 'text-brand-500', icon: 'M1 4h22M1 10h22M1 16h22' },
  { label: 'Students Needing Remediation', query: 'List students needing targeted academic remediation', color: 'text-amber-500', icon: 'M12 19l9-2-9-13-9 13 9 2zm0 0v-8' },
  { label: 'Item Analysis Summary', query: 'Evaluate test item difficulty and discrimination metrics', color: 'text-emerald-500', icon: 'M9 5h7a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2v-3m4-2h.01M17 9v2m0 4v2' },
  { label: 'TOS Hours Breakdown', query: 'Check TOS competency hours allocation', color: 'text-indigo-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
];

function welcomeHtml() {
  const chips = WELCOME_QUERIES.map((q) => `
    <button type="button" class="ai-suggestion-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-200 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-xs" data-query="${q.query}">
      <svg class="w-3.5 h-3.5 ${q.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${q.icon}"/></svg>
      <span>${q.label}</span>
    </button>`).join('');
  return `
    <div class="space-y-3">
      <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
        Hello! I am your <strong>Project KIT AI Copilot</strong>. I plan an execution, run real academic tools against your school data, then answer.
      </p>
      <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-2">Suggested Quick Queries</div>
      <div class="flex flex-wrap gap-2 pt-1">${chips}</div>
    </div>`;
}

function ensureWelcomeMessage(messageList) {
  if (!messageList || messageList.children.length > 0) return;
  appendAssistantReply(messageList, welcomeHtml(), 'complete', null, true);
}

function appendAssistantMessage(messageList, html, status = 'complete', messageId = null, isHtml = true) {
  return appendAssistantReply(messageList, html, status, messageId, isHtml);
}

export function initAIModal() {
  const openButton = document.getElementById('btn-open-ai-modal');
  const closeButton = document.getElementById('btn-close-ai-modal');
  const clearButton = document.getElementById('btn-clear-ai-chat');
  const sidebarButton = document.getElementById('btn-open-ai-sidebar');
  const sidebarClose = document.getElementById('btn-close-ai-sidebar');
  const sidebarDrawer = document.getElementById('ai-sidebar-drawer');
  const { modal, container, messageList, composer } = getAIModalElements();
  if (!modal || !container || !messageList || !composer) return;

  applyAIModalTheme(container, document.documentElement.classList.contains('dark'));

  let pendingPlaceholderId = null;

  const dispatchQuery = async (queryText) => {
    const query = String(queryText || '').trim();
    if (!query || pendingPlaceholderId) return;

    appendUserMessage(messageList, query);

    pendingPlaceholderId = createMessageId();
    const tracker = renderStageTracker();
    const placeholder = createMessageElement({ role: 'assistant', text: '', status: 'pending', messageId: pendingPlaceholderId, isHtml: false });
    const contentNode = placeholder.querySelector('loquix-message-content');
    if (contentNode) contentNode.appendChild(tracker.node);
    messageList.appendChild(placeholder);
    scrollToBottom(messageList);

    const placeholderId = pendingPlaceholderId;
    const info = await ensureInfo();

    try {
      const result = await AiApi.sendAiChat(query, { source: 'frontend-modal' });
      const session = normalizeAiResponse(result);

      tracker.stop(true);
      const item = findMessage(messageList, placeholderId);
      if (!session.answerText && !session.planSteps.length && !session.executionResults.length) {
        renderText(item, messageList, result?.message || 'The assistant could not complete that request.');
      } else {
        renderExecutionInto(item, messageList, session, info);
        recordExecution(query, session);
        recordConversation(query, session.answerText);
      }
      window.dispatchEvent(new CustomEvent(AI_RESPONSE_EVENT, {
        detail: { placeholderMessageId: placeholderId, message: session.answerText || '', session, timestamp: new Date().toISOString() },
      }));
    } catch (error) {
      tracker.stop(false);
      const text = detectUserError(error);
      const item = findMessage(messageList, placeholderId);
      renderText(item, messageList, text);
    } finally {
      if (pendingPlaceholderId === placeholderId) pendingPlaceholderId = null;
    }
  };

  async function ensureInfo() {
    await fetchAiInfo();
    return getAiInfoSync();
  }

  const renderExecutionIntoBound = (target, session, info) => renderExecutionInto(target, messageList, session, info);

  // Menu click: suggestion chips
  messageList.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-suggestion-chip');
    if (chip) {
      const query = chip.getAttribute('data-query');
      if (query) dispatchQuery(query);
    }
  });

  const openSidebar = async () => {
    if (!sidebarDrawer) return;
    const isHidden = sidebarDrawer.classList.contains('hidden');
    if (isHidden) {
      sidebarDrawer.classList.remove('hidden');
      sidebarDrawer.innerHTML = '';
      try {
        const panel = await buildSidebar();
        sidebarDrawer.appendChild(panel);
      } catch (e) {
        sidebarDrawer.innerHTML = '<div class="p-4 text-sm text-gray-400">Sidebar unavailable.</div>';
      }
    } else {
      sidebarDrawer.classList.add('hidden');
    }
  };

  sidebarButton?.addEventListener('click', openSidebar);
  sidebarClose?.addEventListener('click', () => sidebarDrawer?.classList.add('hidden'));
  window.addEventListener(AI_SIDEBAR_OPEN_EVENT, openSidebar);

  window.addEventListener(AI_DEBUG_TOGGLE_EVENT, () => {
    const dev = !isDevMode();
    setDevMode(dev);
    setDebugOpen(dev);
    messageList.querySelectorAll('.ai-debug-panel').forEach((n) => n.remove());
    if (!dev) return;
    const last = messageList.querySelector('loquix-message-item:last-of-type');
    if (last && lastSession) renderExecutionIntoBound(last, lastSession, getAiInfoSync());
  });

  const setModalVisibility = (visible) => {
    if (visible) openModal(modal);
    else closeModal(modal);
  };

  const handleSubmission = (event) => {
    const query = String(event?.detail?.content || '').trim();
    if (!query) return;
    dispatchQuery(query);
  };

  const handleLegacyResponse = (event) => {
    const detail = event?.detail || {};
    if (detail.session) return;
    const { text, payload } = parseAIResponse(detail);
    if (!text && !payload) return;
    const target = findMessage(messageList, detail.placeholderMessageId);
    if (payload) {
      const node = renderAIComponent(payload);
      const block = target?.querySelector?.('loquix-message-content');
      if (!target || !block) {
        const inserted = appendAssistantReply(messageList, '', 'complete', null, false);
        const c = inserted.querySelector('loquix-message-content');
        if (c) { c.innerHTML = ''; c.appendChild(node); }
      } else {
        block.innerHTML = '';
        block.appendChild(node);
      }
    } else if (target) {
      renderText(target, messageList, text);
    } else {
      appendAssistantMessage(messageList, parseMarkdownToHtml(text), 'complete', null, true);
    }
  };

  openButton?.addEventListener('click', () => {
    setModalVisibility(true);
    ensureWelcomeMessage(messageList);
    ensureInfo();
  });

  closeButton?.addEventListener('click', () => setModalVisibility(false));

  clearButton?.addEventListener('click', () => {
    messageList.innerHTML = '';
    ensureWelcomeMessage(messageList);
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) setModalVisibility(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) setModalVisibility(false);
  });

  window.addEventListener('deped_theme_changed', (event) => {
    applyAIModalTheme(container, Boolean(event?.detail?.dark));
  });

  composer.addEventListener('loquix-submit', handleSubmission);
  window.addEventListener(AI_RESPONSE_EVENT, handleLegacyResponse);
  window.addEventListener(AI_MODAL_OPEN_EVENT, () => {
    setModalVisibility(true);
    ensureWelcomeMessage(messageList);
  });
}
