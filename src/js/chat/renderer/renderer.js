// Component renderer registry and orchestration for AI-structured responses
// Exports: registerComponent(name, fn), renderAIComponent(payload)

import { normalizePayload } from './validator.js';

const registry = new Map();

export function registerComponent(name, renderFn) {
  if (!name || typeof renderFn !== 'function') throw new Error('Invalid component registration');
  registry.set(name, renderFn);
}

function createFallbackNode(payload) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-component-fallback p-3 text-sm text-gray-300';
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = (typeof payload === 'string') ? payload : JSON.stringify(payload, null, 2);
  wrapper.appendChild(pre);
  return wrapper;
}

export function renderAIComponent(payload) {
  // Basic validation
  const normalized = normalizePayload(payload);
  if (!normalized) return createFallbackNode('Empty or invalid payload');
  const type = normalized.type;

  const renderer = registry.get(type);
  if (!renderer) return createFallbackNode({error: 'unsupported_type', payload});

  try {
    const node = renderer(normalized);
    if (!node || !(node instanceof HTMLElement)) {
      return createFallbackNode({error: 'invalid_renderer_output', type});
    }
    return node;
  } catch (err) {
    // Log error to console for debugging but return fallback node to avoid breaking UI
    console.error('Renderer error for type', type, err);
    return createFallbackNode({error: 'renderer_exception', message: String(err)});
  }
}

// Register core components. These are lightweight, dependency-free renderers
// so the system remains modular and portable. Additional components can be
// added by importing registerComponent and calling it from elsewhere.

import table from '../components/table.js';
import card from '../components/card.js';
import metric from '../components/metric.js';
import list from '../components/list.js';
import code from '../components/code.js';
import image from '../components/image.js';
import progress from '../components/progress.js';
import alertComp from '../components/alert.js';
import loading from '../components/loading.js';
import empty from '../components/empty.js';
import fileComp from '../components/file.js';
import text from '../components/text.js';
import markdown from '../components/markdown.js';
import timeline from '../components/timeline.js';
import badge from '../components/badge.js';
import accordion from '../components/accordion.js';
import statistics from '../components/statistics.js';
import chart from '../components/chart.js';
import studentList from '../components/student-list.js';
import sectionSummary from '../components/section-summary.js';
import execution from '../components/execution.js';

registerComponent('table', table);
registerComponent('card', card);
registerComponent('metric', metric);
registerComponent('list', list);
registerComponent('code', code);
registerComponent('image', image);
registerComponent('progress', progress);
registerComponent('alert', alertComp);
registerComponent('loading', loading);
registerComponent('empty', empty);
registerComponent('file', fileComp);
registerComponent('text', text);
registerComponent('markdown', markdown);
registerComponent('timeline', timeline);
registerComponent('badge', badge);
registerComponent('accordion', accordion);
registerComponent('statistics', statistics);
registerComponent('chart', chart);
registerComponent('student-list', studentList);
registerComponent('student-info', studentList);
registerComponent('section-summary', sectionSummary);
registerComponent('class-summary', sectionSummary);
registerComponent('ai-execution', execution);
registerComponent('assistant-run', execution);

// Also accept a few common synonyms
registerComponent('metrics', metric);
registerComponent('kpi', metric);
registerComponent('cards', card);
registerComponent('stats', statistics);
registerComponent('cards', card);
registerComponent('plain', text);

export default {
  registerComponent,
  renderAIComponent,
};
