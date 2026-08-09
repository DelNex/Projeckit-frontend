// Collapsible AI sidebar — system status, available tools, session, history.
// Only friendly display info. Never tenantId, database ids, or internal rows.

import { fetchAiInfo, getAiInfoSync } from './ai-info.js';
import { listExecutions, listConversations, clearHistory } from './session-store.js';

export const AI_SIDEBAR_OPEN_EVENT = 'pk_ai_sidebar_toggle';
export const AI_DEBUG_TOGGLE_EVENT = 'pk_ai_debug_toggle';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function section(title, contentNode) {
  const s = el('div', 'ai-info-section');
  s.appendChild(el('div', 'ai-info-section-title', title));
  s.appendChild(contentNode);
  return s;
}

function statRow(label, value) {
  const row = el('div', 'ai-info-row');
  row.appendChild(el('span', 'ai-info-key', label));
  row.appendChild(el('span', 'ai-info-value', String(value === null || value === undefined || value === '' ? '—' : value)));
  return row;
}

function buildSystemBlock(info) {
  return section('System', (() => {
    const box = el('div', 'ai-info-block');
    box.appendChild(statRow('AI version', info.aiVersion || '—'));
    box.appendChild(statRow('Planner', info.planner?.status || '—'));
    box.appendChild(statRow('System prompt', info.systemPromptLoaded ? 'Loaded' : '—'));
    box.appendChild(statRow('Registered tools', String(info.toolCount ?? 0)));
    return box;
  })());
}

function buildToolsBlock(info) {
  const box = el('div', 'ai-info-block');
  const tools = info.tools || [];
  if (!tools.length) {
    box.appendChild(el('div', 'text-xs text-gray-400', 'No tools available.'));
  }
  tools.forEach((tool) => {
    const row = el('div', 'ai-tool-listing');
    row.appendChild(el('div', 'ai-tool-listing-name', tool.name || tool.id));
    if (tool.description) {
      row.appendChild(el('div', 'ai-tool-listing-desc', tool.description));
    }
    box.appendChild(row);
  });
  return section('Available tools', box);
}

function buildSessionBlock(info) {
  const s = (info.session || {}) ;
  return section('Session', (() => {
    const box = el('div', 'ai-info-block');
    box.appendChild(statRow('User', s.displayName || '—'));
    box.appendChild(statRow('Role', s.role || '—'));
    box.appendChild(statRow('Tenant', s.tenantName || '—'));
    return box;
  })());
}

function buildHistoryBlock() {
  const box = el('div', 'ai-info-block');
  const execution = listExecutions();
  box.appendChild(el('div', 'ai-recent-label', 'Recent executions'));
  if (!execution.length) {
    box.appendChild(el('div', 'text-xs text-gray-400', 'Nothing yet.'));
  }
  execution.slice(0, 5).forEach((item) => {
    const row = el('div', 'ai-history-row');
    row.appendChild(el('span', 'ai-history-status-dot ' + (item.failed ? 'bg-rose-500' : 'bg-emerald-500'), ''));
    row.appendChild(el('div', 'ai-history-text', item.query));
    row.appendChild(el('div', 'ai-history-value', `${item.toolCount ?? 0} tools · ${item.durationMs ?? 0}ms`));
    box.appendChild(row);
  });

  box.appendChild(el('div', 'ai-info-divider', ''));
  const conversations = listConversations();
  box.appendChild(el('div', 'ai-recent-label', 'Recent conversations'));
  conversations.slice(0, 3).forEach((item) => {
    box.appendChild(el('div', 'ai-history-line', item.query));
  });

  const clearBtn = el('button', 'ai-info-clear', 'Clear history');
  clearBtn.type = 'button';
  clearBtn.addEventListener('click', () => {
    clearHistory();
    window.dispatchEvent(new CustomEvent('pk_ai_history_cleared'));
  });
  box.appendChild(clearBtn);
  return section('History', box);
}

function buildDebugToggle() {
  const toggle = el('button', 'ai-info-debug-toggle', 'Developer panel');
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent(AI_DEBUG_TOGGLE_EVENT));
  });
  return toggle;
}

export async function buildSidebar() {
  const info = await fetchAiInfo();

  const container = el('div', 'ai-sidebar');
  const header = el('div', 'ai-sidebar-header');
  header.appendChild(el('div', 'ai-sidebar-title', 'AI Workspace'));
  container.appendChild(header);

  container.appendChild(buildSystemBlock(info));
  container.appendChild(buildSessionBlock(info));
  container.appendChild(buildToolsBlock(info));
  container.appendChild(buildHistoryBlock());
  container.appendChild(buildDebugToggle());

  return container;
}

export default { buildSidebar, AI_SIDEBAR_OPEN_EVENT, AI_DEBUG_TOGGLE_EVENT };