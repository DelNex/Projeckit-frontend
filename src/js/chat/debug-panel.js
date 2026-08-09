// Developer-only debug view of a single AI execution.
// Shows planner steps, tool inputs/outputs, permission results and audit rows.
// Strictly no tenantId, database ids, internal SQL, or Prisma internals.

let open = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function safe(value, maxLength = 600) {
  let out;
  try {
    out = JSON.stringify(value, null, 2);
  } catch (e) {
    out = String(value);
  }
  if (out && out.length > maxLength) out = `${out.slice(0, maxLength)}\n… truncated`;
  return out || '—';
}

function redactJson(value) {
  // Remove purely-internal surrogate ids from debug output without removing
  // domain identifiers (section names, subject codes, LRNs).
  const KEY = /^(tenantId|userId|configId|evaluatorId|createdBy|usedBy|subjectId|responseId|creatorId)$/i;
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      const isInternal = KEY.test(k) || (k === 'id' && /^\d+$/.test(String(v)));
      out[isInternal ? `[${k}] filtered` : k] = redactJson(v);
    });
    return out;
  }
  return value;
}

function block(title, contentNode) {
  const b = el('div', 'ai-debug-block');
  b.appendChild(el('div', 'ai-debug-title', title));
  b.appendChild(contentNode);
  return b;
}

function codeBlock(value, label) {
  const pre = el('pre', 'ai-debug-pre');
  pre.textContent = safe(redactJson(value));
  const wrap = el('div', 'ai-debug-code');
  if (label) wrap.appendChild(el('div', 'ai-debug-code-label', label));
  wrap.appendChild(pre);
  return wrap;
}

export function renderDebugPanel(session) {
  const panel = el('div', 'ai-debug-panel');

  panel.appendChild(block('Intent & parameters', codeBlock(
    { intent: session.intent, parameters: session.parameters },
    'Planner input',
  )));

  panel.appendChild(block('Planner output', codeBlock(
    {
      intent: session.intent,
      steps: (session.planSteps || []).map((s) => ({ id: s.id, tool: s.tool, dependsOn: s.dependsOn || [] })),
    },
    'Plan',
  )));

  panel.appendChild(block('Tool inputs', codeBlock(
    (session.planSteps || []).reduce((acc, s) => {
      acc[s.id] = s.input ?? null;
      return acc;
    }, {}),
    'Inputs',
  )));

  panel.appendChild(block('Tool outputs', codeBlock(
    (session.executionResults || []).reduce((acc, r) => {
      acc[r.toolId] = r.status === 'success' ? r.output : { error: r.error };
      return acc;
    }, {}),
    'Outputs',
  )));

  panel.appendChild(block('Permission results', codeBlock(
    (session.executionResults || []).map((r) => ({
      tool: r.toolId,
      allowed: r.status !== 'failure' || !/permission/i.test(String(r.error || '')),
      scope: 'tenant',
    })),
    'Permissions',
  )));

  panel.appendChild(block('Audit trail', codeBlock(
    (session.executionResults || []).map((r) => ({
      action: `ai.tool.${r.toolId}.${r.status === 'success' ? 'ok' : 'fail'}`,
      status: r.status,
      durationMs: r.durationMs,
      timestamp: session.timestamp,
    })),
    'Audit entries',
  )));

  panel.appendChild(block('Execution timeline', buildTimeline((session.planSteps || []), (session.executionResults || []))));

  const close = el('button', 'ai-debug-close', 'Close developer panel');
  close.type = 'button';
  close.addEventListener('click', () => setDebugPanel(false));
  panel.appendChild(close);

  return panel;
}

function buildTimeline(plans, results) {
  const list = el('div', 'ai-debug-timeline');
  const resultById = {};
  results.forEach((r) => {
    resultById[r.stepId || r.toolId] = r;
  });
  plans.forEach((s) => {
    const res = resultById[s.id];
    const row = el('div', 'ai-debug-timeline-row');
    row.appendChild(el('span', 'ai-debug-timeline-dot', ''));
    row.appendChild(el('span', 'ai-debug-timeline-text', `${s.id} · ${s.tool}`));
    if (res) row.appendChild(el('span', 'ai-debug-timeline-time', `${res.durationMs ?? 0}ms · ${res.status}`));
    list.appendChild(row);
  });
  return list;
}

export function isDebugOpen() {
  return open;
}

export function setDebugOpen(value) {
  open = Boolean(value);
  return open;
}

export default { renderDebugPanel, isDebugOpen, setDebugOpen };