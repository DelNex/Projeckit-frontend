// Safe local persistence for AI history. Only stores friendly summaries —
// never tenant ids, database ids, or raw tool payloads.

const CONVERSATIONS_KEY = 'pk_ai_conversations';
const EXECUTION_KEY = 'pk_ai_execution_history';
const DEV_MODE_KEY = 'pk_ai_dev_mode';
const MAX_CONVERSATIONS = 12;
const MAX_EXECUTIONS = 20;

function read(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : [];
  } catch (e) {
    return [];
  }
}

function write(key, items) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    // Storage unavailable — ignore
  }
}

function getSessionSummary(query, toolCount, durationMs, failed) {
  return {
    ts: new Date().toISOString(),
    query: String(query || '').slice(0, 200),
    toolCount,
    durationMs,
    failed: Boolean(failed),
  };
}

export function recordExecution(query, session) {
  const items = read(EXECUTION_KEY);
  items.unshift(getSessionSummary(query, session?.toolCount || 0, session?.executionTimeMs || 0, (session?.failed || 0) > 0));
  write(EXECUTION_KEY, items.slice(0, MAX_EXECUTIONS));
}

export function listExecutions() {
  return read(EXECUTION_KEY);
}

export function recordConversation(query, answer) {
  const items = read(CONVERSATIONS_KEY);
  items.unshift({
    ts: new Date().toISOString(),
    query: String(query || '').slice(0, 200),
    answer: String(answer || '').slice(0, 400),
  });
  write(CONVERSATIONS_KEY, items.slice(0, MAX_CONVERSATIONS));
}

export function listConversations() {
  return read(CONVERSATIONS_KEY);
}

export function clearHistory() {
  write(CONVERSATIONS_KEY, []);
  write(EXECUTION_KEY, []);
}

export function isDevMode() {
  try {
    return window.localStorage.getItem(DEV_MODE_KEY) === '1' || /[?&]dev=1/.test(window.location.search);
  } catch (e) {
    return false;
  }
}

export function setDevMode(enabled) {
  try {
    window.localStorage.setItem(DEV_MODE_KEY, enabled ? '1' : '0');
  } catch (e) {
    // ignore
  }
  return enabled;
}

export default {
  recordExecution,
  listExecutions,
  recordConversation,
  listConversations,
  clearHistory,
  isDevMode,
  setDevMode,
};