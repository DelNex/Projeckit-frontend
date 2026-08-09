// Full execution renderer — registered as type 'ai-execution'.
// Lane: Answer → Pipeline → Tool cards → Retrieved academic data → Metadata → Reasoning.

import { parseMarkdownToHtml } from './markdown.js';
import { renderToolCard } from './tool-card.js';
import renderTable from './table.js';
import renderStatistics from './statistics.js';
import renderCode from './code.js';

const INTERNAL_ID_KEYS = /^(id|tenantId|userId|configId|evaluatorId|createdBy|usedBy|subjectId|facultyId|responseId|creatorId)$/i;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function friendlyName(toolId) {
  return String(toolId || '')
    .split(/[._-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isNumericString(value) {
  return /^\d+(\.\d+)?$/.test(String(value));
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch (e) {
    return String(iso || '');
  }
}

function stringifyRowValue(value) {
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function renderAcademicOutput(toolId, output, toolMeta) {
  const meta = (toolMeta && toolMeta[toolId]) || {};
  const title = `${meta.name || friendlyName(toolId)} — Retrieved data`;

  if (Array.isArray(output)) {
    if (!output.length) {
      return el('div', 'text-sm text-gray-500 dark:text-gray-400', `${title}: no rows returned.`);
    }
    const objects = output.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    if (objects.length) {
      const probeKeys = Object.keys(objects[0]).filter((key) =>
        objects.slice(0, 12).some((row) => !INTERNAL_ID_KEYS.test(key)),
      );
      const columns = probeKeys;
      if (!columns.length) {
        return renderCode({ language: 'text', code: JSON.stringify({ rows: output.length }) });
      }
      const rows = output.map((row) =>
        columns.map((key) => stringifyRowValue(row ? row[key] : null)),
      );
      return renderTable({ title, columns, rows });
    }
  }

  if (output && typeof output === 'object') {
    const entries = Object.entries(output).filter(([key]) => !INTERNAL_ID_KEYS.test(key));
    const numeric = entries.filter(([, v]) => typeof v === 'number' || isNumericString(v));
    if (numeric.length && numeric.length === entries.length) {
      return renderStatistics({
        title,
        items: numeric.map(([label, value]) => ({ label: String(label), value: String(value) })),
      });
    }
    return renderTable({
      title,
      columns: ['Field', 'Value'],
      rows: entries.map(([key, value]) => [String(key), stringifyRowValue(value)]),
    });
  }

  return renderCode({ language: 'text', title, code: JSON.stringify(output ?? null, null, 2) });
}

function buildPipelineStrip(session) {
  const strip = el('div', 'ai-pipeline-strip');
  const planActive = session.plannerStepCount > 0;
  const toolsActive = session.toolCount > 0;
  const answerActive = Boolean(session.answerText);
  const steps = [
    { label: 'Planning', active: planActive },
    { label: 'Tools', active: toolsActive },
    { label: 'Synthesis', active: answerActive },
    { label: 'Answer', active: answerActive },
  ];
  steps.forEach((step, i) => {
    if (i > 0) strip.appendChild(el('span', 'ai-pipeline-arrow', '→'));
    const chip = el('span', `ai-pipeline-chip${step.active ? ' is-active' : ''}`, step.label);
    strip.appendChild(chip);
  });
  return strip;
}

function buildToolCards(session, toolMeta) {
  if (!session.executionResults || !session.executionResults.length) return null;
  const grid = el('div', 'ai-tool-grid');
  session.executionResults.forEach((result) => {
    grid.appendChild(renderToolCard(result, (toolMeta && toolMeta[result.toolId]) || {}));
  });
  return grid;
}

function buildMetadata(session) {
  const grid = el('div', 'ai-exec-meta-grid');
  [['Execution time', `${session.executionTimeMs || 0} ms`],
    ['Tools', String(session.toolCount || 0)],
    ['Planner steps', String(session.plannerStepCount || 0)],
    ['Timestamp', formatTime(session.timestamp)]].forEach(([label, value]) => {
    const cell = el('div', 'ai-exec-meta-cell');
    cell.appendChild(el('div', 'ai-exec-meta-label', label));
    cell.appendChild(el('div', 'ai-exec-meta-value', value));
    grid.appendChild(cell);
  });
  return grid;
}

function derivedReasoning(session) {
  if (!session.intent && !session.planSteps.length) return null;
  const names = (session.planSteps || [])
    .map((s) => friendlyName(s.tool))
    .filter(Boolean)
    .join(', ') || 'no tool';
  return `The planner matched intent "${session.intent || 'your request'}" and selected ${names}. Tool outputs were synthesized into the final answer.`;
}

function buildReasoning(session) {
  const text = session.reasoning || derivedReasoning(session);
  if (!text) return null;
  const section = el('div', 'ai-accordion-section');
  const button = el('button', 'flex w-full items-center justify-between text-left text-sm font-semibold text-gray-900 dark:text-white/90 ai-accordion-trigger', '');
  button.appendChild(el('span', '', 'Reasoning'));
  const caret = el('span', 'text-xs text-gray-500 dark:text-gray-400 transition-transform', '▾');
  button.appendChild(caret);
  const content = el('div', 'ai-accordion-content mt-2 hidden text-sm leading-6 text-gray-700 dark:text-gray-300');
  content.appendChild(el('div', '', text));
  if (session.reasoningSynthetic) {
    content.appendChild(el('div', 'mt-2 text-xs text-gray-500 dark:text-gray-500', 'Derived from the planner output above.'));
  }
  button.addEventListener('click', () => {
    const hidden = content.classList.toggle('hidden');
    caret.classList.toggle('rotate-180', !hidden);
  });
  section.appendChild(button);
  section.appendChild(content);
  return section;
}

function buildCitations(session) {
  if (!session.citations || !session.citations.length) return null;
  const block = el('div', 'ai-exec-citations');
  block.appendChild(el('div', 'ai-section-label', 'Citations'));
  const list = el('ul', 'list-disc pl-5 text-sm text-gray-600 dark:text-gray-300 space-y-1');
  session.citations.forEach((c) => {
    let label = c;
    if (c && typeof c === 'object') label = c.source || c.title || c.text || c.url || '';
    list.appendChild(el('li', '', typeof label === 'string' ? label : 'Citation'));
  });
  block.appendChild(list);
  return block;
}

function buildErrorCallout(session) {
  const err = session.friendlyError;
  if (!err) return null;
  const box = el('div', 'ai-alert ai-callout-error');
  box.appendChild(el('div', 'font-semibold', err.label));
  const detail = {
    no_plan: 'Could the academic tool in your scope match this request? Try referencing sections, subjects, reports, or analytics.',
    permission_denied: 'Your current role does not grant access to run this tool.',
    tool_not_found: 'The selected tool is no longer registered in this environment.',
  }[err.code] || 'No academic data matched this request. Try rephrasing it.';
  box.appendChild(el('div', 'text-sm', detail));
  return box;
}

function buildAcademicSection(session, toolMeta) {
  const frames = (session.executionResults || []).filter(
    (r) => r.status === 'success' && r.output !== undefined && r.output !== null,
  );
  if (!frames.length) return null;
  const section = el('div', 'ai-academic-data');
  section.appendChild(el('div', 'ai-section-label', 'Retrieved academic data'));
  frames.forEach((frame) => {
    section.appendChild(renderAcademicOutput(frame.toolId, frame.output, toolMeta));
  });
  return section;
}

function recentAnswer(session) {
  const block = el('div', 'ai-answer-block');
  block.appendChild(el('div', 'ai-section-label', 'Answer'));
  const body = el('div', 'ai-answer-body');
  body.innerHTML = parseMarkdownToHtml(session.answerText || '');
  block.appendChild(body);
  return block;
}

export function renderExecution(payload) {
  const session = (payload && payload.session) || {};
  const toolMeta = (payload && payload.toolMeta) || {};
  const wrapper = el('div', 'ai-execution');

  wrapper.appendChild(el('div', 'ai-pipeline-label', 'Execution Pipeline'));
  wrapper.appendChild(buildPipelineStrip(session));

  const toolCards = buildToolCards(session, toolMeta);
  if (toolCards) {
    wrapper.appendChild(el('div', 'ai-section-label', 'Tools used'));
    wrapper.appendChild(toolCards);
  }

  const academic = buildAcademicSection(session, toolMeta);
  if (academic) wrapper.appendChild(academic);

  wrapper.appendChild(el('div', 'ai-section-label', 'Execution metadata'));
  wrapper.appendChild(buildMetadata(session));

  const reasoning = buildReasoning(session);
  if (reasoning) {
    wrapper.appendChild(el('div', 'ai-section-label', 'Analysis'));
    wrapper.appendChild(reasoning);
  }

  const citations = buildCitations(session);
  if (citations) wrapper.appendChild(citations);

  wrapper.appendChild(el('hr', 'ai-rule'));
  wrapper.appendChild(recentAnswer(session));

  const err = wrapErrorCallout(session);
  if (err) wrapper.appendChild(err);
  return wrapper;
}

function wrapErrorCallout(session) {
  const callout = buildErrorCallout(session);
  if (!callout) return null;
  const wrap = el('div', 'ai-error-area');
  wrap.appendChild(callout);
  return wrap;
}

export default renderExecution;