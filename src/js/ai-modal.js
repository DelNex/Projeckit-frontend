import '@loquix/core';
import '@loquix/core/tokens/variables.css';
import { parseMarkdownToHtml } from './chat/components/markdown.js';
import { fetchAiInfo, getAiInfoSync } from './chat/ai-info.js';
import { buildSidebar, AI_SIDEBAR_OPEN_EVENT } from './chat/sidebar.js';
import { AiApi } from './api/index.js';
import { sendAiChatStream, uploadModule, getCurrentAssessmentId } from './api/ai-api.js';
import { getCurrentUiContext } from './ai-ui-context.js';
import { renderRichPart, highlightUiTarget, appendTurnFollowUpChips } from './chat/components/rich-renderer.js';

const AI_MODAL_OPEN_EVENT  = 'deped_open_ai_modal';
const AI_MODAL_OPENED      = 'deped_ai_modal_opened';
const AI_MODAL_CLOSED      = 'deped_ai_modal_closed';

// ─── Active assessment context ───────────────────────────────────────────────
let activeAssessmentId   = null;   // set when teacher is in a workspace
let activeAssessmentLabel = null;  // display name
let abortController       = null;  // SSE abort

function getAssessmentIdFromUrl() {
  return getCurrentAssessmentId();
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────
function createMessageId() {
  return `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMessageElement({ role, text = '', messageId, status = 'complete', isHtml = false }) {
  const item = document.createElement('loquix-message-item');
  item.setAttribute('sender', role === 'user' ? 'user' : 'assistant');
  item.setAttribute('show-avatar', '');
  if (messageId) item.setAttribute('message-id', messageId);
  if (status && status !== 'complete') item.setAttribute('status', status);
  const content = document.createElement('loquix-message-content');
  if (isHtml) content.innerHTML = text;
  else content.textContent = text;
  item.appendChild(content);
  return item;
}

function getContentNode(item) {
  return item?.querySelector('loquix-message-content') || null;
}

function scrollToBottom(list) {
  if (typeof list?.scrollToBottom === 'function') list.scrollToBottom('instant');
}

function getModalElements() {
  const modal       = document.getElementById('ai-modal');
  const container   = modal?.querySelector('loquix-chat-container');
  const messageList = modal?.querySelector('loquix-message-list');
  const composer    = document.getElementById('ai-chat-composer') || modal?.querySelector('loquix-chat-composer');
  const contextBar  = document.getElementById('ai-assessment-context-bar');
  const contextLabel = document.getElementById('ai-context-label');
  return { modal, container, messageList, composer, contextBar, contextLabel };
}

// ─── Assessment context badge ─────────────────────────────────────────────────
function updateContextBar({ contextBar, contextLabel }) {
  if (!contextBar) return;
  if (activeAssessmentId) {
    contextBar.classList.remove('hidden');
    if (contextLabel) contextLabel.textContent = activeAssessmentLabel
      ? `Assessment context: ${activeAssessmentLabel}`
      : `Assessment #${activeAssessmentId} context active`;
  } else {
    contextBar.classList.add('hidden');
  }
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(container, isDark) {
  if (!container) return;
  const modal = container.closest('#ai-modal');
  container.classList.toggle('loquix-theme-dark', isDark);
  container.classList.toggle('loquix-theme-light', !isDark);
  container.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (modal) modal.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// ─── Modal visibility ─────────────────────────────────────────────────────────
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

// ─── Working state element ─────────────────────────────────────────────────────
function createWorkingElement() {
  const wrap = document.createElement('div');
  wrap.className = 'ai-working-state py-2 space-y-1';
  wrap.innerHTML = `<div class="ai-working-header flex items-center gap-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none" onclick="this.parentElement.classList.toggle('collapsed')">
    <svg class="w-3 h-3 text-brand-400 animate-spin ai-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2.5" stroke-dasharray="60" stroke-dashoffset="15"/></svg>
    <span class="ai-working-title">Working</span>
    <span class="ml-auto ai-working-time text-gray-400 dark:text-gray-600"></span>
  </div>
  <div class="ai-working-steps pl-5 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400"></div>`;
  return wrap;
}

function addWorkingStep(workingEl, toolId, label, status = 'pending') {
  const steps = workingEl.querySelector('.ai-working-steps');
  if (!steps) return;
  const id = `step-${toolId.replace(/[^a-z0-9]/gi, '-')}`;
  let step = steps.querySelector(`#${id}`);
  if (!step) {
    step = document.createElement('div');
    step.id = id;
    step.className = 'flex items-center gap-1.5';
    steps.appendChild(step);
  }
  const icons = {
    pending: '<svg class="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>',
    running: '<svg class="w-3 h-3 text-brand-400 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2.5" stroke-dasharray="60" stroke-dashoffset="15"/></svg>',
    success: '<svg class="w-3 h-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    failure: '<svg class="w-3 h-3 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke-width="2.5" stroke-linecap="round"/></svg>',
    thinking: '<svg class="w-3 h-3 text-amber-400 shrink-0 animate-pulse" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>',
  };
  step.innerHTML = `${icons[status] || icons.pending} <span>${label}</span>`;
}

function finalizeWorking(workingEl, durationMs) {
  const spinner = workingEl.querySelector('.ai-spinner');
  const title   = workingEl.querySelector('.ai-working-title');
  const timeEl  = workingEl.querySelector('.ai-working-time');
  if (spinner) spinner.classList.remove('animate-spin');
  if (title)   title.textContent = '▸ Working';
  if (timeEl)  timeEl.textContent = `completed in ${(durationMs / 1000).toFixed(1)}s`;
  workingEl.querySelector('.ai-working-header')?.classList.add('collapsed');
}

// ─── SSE stream reader ────────────────────────────────────────────────────────
async function* readSSEStream(readable) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial last line
      let event = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) { event = line.slice(7).trim(); }
        else if (line.startsWith('data: ') && event) {
          try { yield { event, data: JSON.parse(line.slice(6)) }; } catch { /* bad JSON */ }
          event = null;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Markdown-aware renderer for final answer ─────────────────────────────────
function renderMarkdownAnswer(html) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-answer prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed';
  wrap.innerHTML = html;
  // Make tables scrollable
  wrap.querySelectorAll('table').forEach((t) => {
    const scroll = document.createElement('div');
    scroll.className = 'overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 my-2';
    t.parentNode.insertBefore(scroll, t);
    scroll.appendChild(t);
    t.className = 'text-xs w-full border-collapse';
  });
  return wrap;
}

function getPageSpecificChips(uiContext) {
  const pageId = uiContext?.pageId || 'dashboard';

  switch (pageId) {
    case 'exam-import':
      return [
        { label: 'How do I scan?', query: 'How do I scan student answer sheets?', color: 'text-brand-500' },
        { label: 'Sheet not detected', query: 'My sheet wasn\'t detected by the camera', color: 'text-amber-500' },
        { label: 'Flagged response', query: 'Why was this response flagged?', color: 'text-rose-500' },
        { label: 'What do I do here?', query: 'What do I do on the OMR page?', color: 'text-indigo-500' },
      ];
    case 'item-analysis':
      return [
        { label: 'Difficulty index (P)', query: 'Explain difficulty index P in item analysis', color: 'text-brand-500' },
        { label: 'Discrimination (D)', query: 'Explain discrimination index D', color: 'text-emerald-500' },
        { label: 'Items to revise', query: 'Which items need revision?', color: 'text-amber-500' },
        { label: 'Explain this page', query: 'What do I do on this page?', color: 'text-indigo-500' },
      ];
    case 'reports':
      return [
        { label: 'Explain this report', query: 'Explain this quarterly performance report', color: 'text-brand-500' },
        { label: 'Print this report', query: 'Can I print this report?', color: 'text-emerald-500' },
        { label: 'Export results', query: 'How do I export section results?', color: 'text-indigo-500' },
      ];
    case 'assessment-workspace':
      return [
        { label: 'Generate test paper', query: 'How do I generate the test?', color: 'text-brand-500' },
        { label: 'Check TOS', query: 'Check TOS competency hours allocation', color: 'text-emerald-500' },
        { label: 'Manage Answer Key', query: 'How do I set the answer key?', color: 'text-amber-500' },
        { label: 'Next step', query: 'What should I do next for this assessment?', color: 'text-indigo-500' },
      ];
    default:
      return [
        { label: 'Create an assessment', query: 'How do I create an assessment?', color: 'text-brand-500' },
        { label: 'Review performance', query: 'Show overall performance this quarter', color: 'text-emerald-500' },
        { label: 'Teach me Project KIT', query: 'I\'m new. Teach me how to use Project KIT.', color: 'text-amber-500' },
        { label: 'Explain this page', query: 'What do I do on this page?', color: 'text-indigo-500' },
      ];
  }
}

function welcomeHtml() {
  const uiContext = getCurrentUiContext();
  const chips = getPageSpecificChips(uiContext);

  const chipsHtml = chips
    .map(
      (q) => `
    <button type="button" class="ai-suggestion-chip inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-200 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-xs" data-query="${q.query}">
      <span class="w-1.5 h-1.5 rounded-full ${q.color.replace('text-', 'bg-')}"></span>
      <span>${q.label}</span>
    </button>`
    )
    .join('');

  const contextNote = `
    <div class="flex items-center gap-1.5 text-[11px] text-brand-600 dark:text-brand-400 font-semibold pt-1">
      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      Page context active: <strong>${uiContext.pageTitle}</strong> (${uiContext.device.type})
    </div>
  `;

  return `<div class="space-y-3">
    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
      Hello! I am your <strong>Project KIT Context-Aware Teaching Assistant</strong>. I understand your current page, active controls, and assessment state.
    </p>
    ${contextNote}
    <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-2">Page Quick Actions</div>
    <div class="flex flex-wrap gap-2 pt-1">${chipsHtml}</div>
  </div>`;
}

function ensureWelcome(list) {
  if (!list || list.children.length > 0) return;
  const item = createMessageElement({ role: 'assistant', text: welcomeHtml(), isHtml: true });
  list.appendChild(item);
  scrollToBottom(list);
}

// ─── File upload UI ────────────────────────────────────────────────────────────
function buildUploadButton(onUpload) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-ai-attach';
  btn.title = 'Upload teaching material';
  btn.className = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 transition-colors';
  btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg><span>Attach</span>`;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.docx,.txt,.md';
  input.className = 'hidden';
  input.id = 'ai-file-input';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) { onUpload(file); input.value = ''; }
  });
  btn.addEventListener('click', () => input.click());
  return { btn, input };
}

// ─── Main init ─────────────────────────────────────────────────────────────────
export function initAIModal() {
  const openButton   = document.getElementById('btn-open-ai-modal');
  const closeButton  = document.getElementById('btn-close-ai-modal');
  const clearButton  = document.getElementById('btn-clear-ai-chat');
  const sidebarButton = document.getElementById('btn-open-ai-sidebar');
  const sidebarClose  = document.getElementById('btn-close-ai-sidebar');
  const sidebarDrawer = document.getElementById('ai-sidebar-drawer');
  const clearCtxBtn   = document.getElementById('btn-clear-ai-context');
  const { modal, container, messageList, composer, contextBar, contextLabel } = getModalElements();
  if (!modal || !container || !messageList || !composer) return;

  applyTheme(container, document.documentElement.classList.contains('dark'));

  // ── Detect assessment workspace context ──────────────────────────────────────
  function detectWorkspaceContext() {
    const id = getAssessmentIdFromUrl();
    if (id && id !== activeAssessmentId) {
      activeAssessmentId = id;
      // Try to get a label from the DOM
      const titleEl = document.querySelector('#assessment-title, [data-assessment-title], h1');
      activeAssessmentLabel = titleEl?.textContent?.trim() || null;
      updateContextBar({ contextBar, contextLabel });
    }
  }
  detectWorkspaceContext();
  window.addEventListener('popstate', detectWorkspaceContext);

  // Inject file attach button into the modal toolbar area
  const toolbarArea = document.querySelector('#ai-modal .flex.items-center.gap-2');
  if (toolbarArea) {
    const { btn: attachBtn, input: fileInput } = buildUploadButton(handleFileUpload);
    toolbarArea.prepend(attachBtn);
    document.body.appendChild(fileInput);
  }

  clearCtxBtn?.addEventListener('click', () => {
    activeAssessmentId = null;
    activeAssessmentLabel = null;
    updateContextBar({ contextBar, contextLabel });
  });

  // ── Core dispatch ────────────────────────────────────────────────────────────
  let isPending = false;

  const dispatchQuery = async (queryText) => {
    const query = String(queryText || '').trim();
    if (!query || isPending) return;
    isPending = true;

    // Cancel any in-flight request
    if (abortController) { abortController.abort(); abortController = null; }
    abortController = new AbortController();

    // User message
    const userItem = createMessageElement({ role: 'user', text: query, messageId: createMessageId() });
    messageList.appendChild(userItem);
    scrollToBottom(messageList);

    // Placeholder with working state
    const placeholderId = createMessageId();
    const placeholder = createMessageElement({ role: 'assistant', text: '', status: 'pending', messageId: placeholderId });
    const placeholderContent = getContentNode(placeholder);

    const workingEl = createWorkingElement();
    if (placeholderContent) placeholderContent.appendChild(workingEl);
    messageList.appendChild(placeholder);
    scrollToBottom(messageList);

    const startTime = Date.now();

    const uiContext = getCurrentUiContext();

    try {
      const streamBody = await sendAiChatStream(
        query,
        { source: 'assessment-workspace' },
        activeAssessmentId,
        { signal: abortController.signal, uiContext },
      );

      let fullAnswer = '';
      let answerNode = null;

      for await (const { event, data } of readSSEStream(streamBody)) {
        switch (event) {
          case 'context_resolved':
            if (data.title && !activeAssessmentLabel) {
              activeAssessmentLabel = data.title;
              updateContextBar({ contextBar, contextLabel });
            }
            break;

          case 'message_part':
          case 'confirmation_required':
          case 'ui_action': {
            finalizeWorking(workingEl, Date.now() - startTime);
            const partEl = renderRichPart(data.part || data, dispatchQuery, (act) => {
              if (act.target) highlightUiTarget(act.target);
            });
            if (placeholderContent) placeholderContent.appendChild(partEl);
            placeholder.removeAttribute('status');
            scrollToBottom(messageList);
            break;
          }

          case 'tool_start':
            addWorkingStep(workingEl, data.toolId, data.label, 'running');
            scrollToBottom(messageList);
            break;

          case 'tool_result':
            addWorkingStep(workingEl, data.toolId, data.toolId.split('.').pop(), data.status === 'success' ? 'success' : 'failure');
            scrollToBottom(messageList);
            break;

          case 'thinking_start':
            addWorkingStep(workingEl, '__thinking__', data.label || 'Generating response...', 'thinking');
            scrollToBottom(messageList);
            break;

          case 'answer_delta':
            if (!answerNode) {
              // Replace working indicator with answer
              finalizeWorking(workingEl, Date.now() - startTime);
              answerNode = renderMarkdownAnswer('');
              if (placeholderContent) placeholderContent.appendChild(answerNode);
              placeholder.removeAttribute('status');
            }
            fullAnswer += data.text || '';
            answerNode.innerHTML = parseMarkdownToHtml(fullAnswer);
            scrollToBottom(messageList);
            break;

          case 'message_complete':
            finalizeWorking(workingEl, Date.now() - startTime);
            if (answerNode) {
              answerNode.innerHTML = parseMarkdownToHtml(data.text || fullAnswer);
            } else if (data.text) {
              const finalNode = renderMarkdownAnswer(parseMarkdownToHtml(data.text));
              if (placeholderContent) { placeholderContent.innerHTML = ''; placeholderContent.appendChild(finalNode); }
              placeholder.removeAttribute('status');
            }
            if (placeholderContent) {
              appendTurnFollowUpChips(placeholderContent, uiContext.pageId, dispatchQuery);
            }
            scrollToBottom(messageList);
            break;

          case 'error':
            finalizeWorking(workingEl, Date.now() - startTime);
            if (placeholderContent) {
              placeholderContent.innerHTML = `<div class="text-sm text-red-500 dark:text-red-400">${data.message || 'An error occurred.'} <button class="ai-retry-btn text-brand-500 underline ml-2 text-xs">Retry</button></div>`;
              placeholder.removeAttribute('status');
              placeholderContent.querySelector('.ai-retry-btn')?.addEventListener('click', () => {
                placeholder.remove();
                userItem.remove();
                isPending = false;
                dispatchQuery(query);
              });
            }
            scrollToBottom(messageList);
            break;
        }
      }
      if (placeholderContent) {
        appendTurnFollowUpChips(placeholderContent, uiContext.pageId, dispatchQuery);
      }
    } catch (err) {
      if (err?.name === 'AbortError') { /* user cancelled */ } else {
        finalizeWorking(workingEl, Date.now() - startTime);
        const errMsg = err?.message || 'The assistant could not complete that request.';
        if (placeholderContent) {
          placeholderContent.innerHTML = `<div class="text-sm text-red-500 dark:text-red-400">${errMsg}</div>`;
          placeholder.removeAttribute('status');
        }
      }
    } finally {
      isPending = false;
      abortController = null;
    }
  };

  // ── File upload handler ───────────────────────────────────────────────────────
  async function handleFileUpload(file) {
    const uploadMsg = createMessageElement({ role: 'assistant', text: `<div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><svg class="w-3.5 h-3.5 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2.5" stroke-dasharray="60" stroke-dashoffset="15"/></svg>Uploading <strong>${file.name}</strong>...</div>`, isHtml: true, status: 'pending' });
    messageList.appendChild(uploadMsg);
    scrollToBottom(messageList);
    try {
      const result = await uploadModule(file);
      const content = getContentNode(uploadMsg);
      if (content) {
        content.innerHTML = `<div class="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>${result.filename}</strong> indexed — ${result.charCount?.toLocaleString() ?? '?'} chars. Ask me about its content.</div>`;
      }
      uploadMsg.removeAttribute('status');
    } catch (err) {
      const content = getContentNode(uploadMsg);
      if (content) content.innerHTML = `<div class="text-xs text-red-500">Upload failed: ${err.message || 'unknown error'}</div>`;
      uploadMsg.removeAttribute('status');
    }
    scrollToBottom(messageList);
  }

  // ── Chip clicks ────────────────────────────────────────────────────────────────
  messageList.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-suggestion-chip');
    if (chip) {
      const query = chip.getAttribute('data-query');
      if (query) dispatchQuery(query);
    }
  });

  // ── Sidebar ────────────────────────────────────────────────────────────────────
  const openSidebar = async () => {
    if (!sidebarDrawer) return;
    const hidden = sidebarDrawer.classList.contains('hidden');
    if (hidden) {
      sidebarDrawer.classList.remove('hidden');
      sidebarDrawer.innerHTML = '';
      try { sidebarDrawer.appendChild(await buildSidebar()); }
      catch { sidebarDrawer.innerHTML = '<div class="p-4 text-sm text-gray-400">Sidebar unavailable.</div>'; }
    } else {
      sidebarDrawer.classList.add('hidden');
    }
  };
  sidebarButton?.addEventListener('click', openSidebar);
  sidebarClose?.addEventListener('click', () => sidebarDrawer?.classList.add('hidden'));
  window.addEventListener(AI_SIDEBAR_OPEN_EVENT, openSidebar);

  // ── Composer submit ────────────────────────────────────────────────────────────
  composer.addEventListener('loquix-submit', (event) => {
    const query = String(event?.detail?.content || '').trim();
    if (query) dispatchQuery(query);
  });

  // ── Open / close ───────────────────────────────────────────────────────────────
  openButton?.addEventListener('click', () => {
    detectWorkspaceContext();
    openModal(modal);
    ensureWelcome(messageList);
    fetchAiInfo();
  });
  closeButton?.addEventListener('click', () => closeModal(modal));
  clearButton?.addEventListener('click', () => {
    messageList.innerHTML = '';
    ensureWelcome(messageList);
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(modal); });
  window.addEventListener('deped_theme_changed', (e) => applyTheme(container, Boolean(e?.detail?.dark)));
  window.addEventListener(AI_MODAL_OPEN_EVENT, () => {
    detectWorkspaceContext();
    openModal(modal);
    ensureWelcome(messageList);
  });

  // Listen for assessment workspace context broadcasts from the workspace view
  window.addEventListener('deped_assessment_context_update', (e) => {
    const { assessmentId, title } = e.detail || {};
    if (assessmentId && assessmentId !== activeAssessmentId) {
      activeAssessmentId = assessmentId;
      activeAssessmentLabel = title || null;
      updateContextBar({ contextBar, contextLabel });
    }
  });
}

