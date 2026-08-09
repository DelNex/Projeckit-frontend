// A single executed-tool card shown inside an AI execution result.

const STATUS_META = {
  success: { label: 'Completed', tone: 'success', dot: 'bg-emerald-500' },
  failure: { label: 'Failed', tone: 'error', dot: 'bg-rose-500' },
  skipped: { label: 'Skipped', tone: 'neutral', dot: 'bg-gray-400' },
};

function friendlyName(toolId, meta) {
  const name = (meta && meta.name) || '';
  if (name) return name;
  return String(toolId || '')
    .split(/[._-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function permissionLabel(result) {
  if (result.status === 'failure' && /permission/i.test(String(result.error || ''))) return { label: 'Denied', tone: 'error' };
  if (result.status === 'success') return { label: 'Granted', tone: 'success' };
  if (result.status === 'skipped') return { label: 'Skipped', tone: 'neutral' };
  return { label: 'Granted', tone: 'success' };
}

function chip(text, tone) {
  const el = document.createElement('span');
  el.className = `ai-pill ai-pill-${tone || 'neutral'}`;
  el.textContent = text;
  return el;
}

function stat(label, value) {
  const el = document.createElement('div');
  el.className = 'ai-tool-card-stat';
  const k = document.createElement('div');
  k.className = 'ai-tool-card-stat-label';
  k.textContent = label;
  const v = document.createElement('div');
  v.className = 'ai-tool-card-stat-value';
  v.textContent = value;
  el.appendChild(k);
  el.appendChild(v);
  return el;
}

export function renderToolCard(result, meta) {
  const statusMeta = STATUS_META[result.status] || STATUS_META.skipped;
  const permission = permissionLabel(result);

  const card = document.createElement('div');
  card.className = 'ai-tool-card';

  const head = document.createElement('div');
  head.className = 'ai-tool-card-head';

  const dot = document.createElement('span');
  dot.className = `ai-tool-dot ${statusMeta.dot}`;

  const name = document.createElement('span');
  name.className = 'ai-tool-card-name';
  name.textContent = friendlyName(result.toolId, meta);

  const idEl = document.createElement('span');
  idEl.className = 'ai-tool-card-id';
  idEl.textContent = result.toolId || '';

  head.appendChild(dot);
  head.appendChild(name);
  head.appendChild(idEl);
  card.appendChild(head);

  const statusRow = document.createElement('div');
  statusRow.className = 'ai-tool-card-status';
  statusRow.appendChild(stat('Status', statusMeta.label));
  statusRow.appendChild(stat('Time', `${result.durationMs || 0} ms`));
  statusRow.appendChild(stat('Permission', permission.label));

  if (result.error) {
    statusRow.appendChild(stat('Error', result.error));
  }

  card.appendChild(statusRow);

  if (result.status === 'failure') {
    card.classList.add('ai-tool-card-failed');
  } else if (result.status === 'success' && result.output) {
    const pillRow = document.createElement('div');
    pillRow.className = 'ai-tool-card-pills';
    pillRow.appendChild(chip('Data retrieved', 'success'));
    card.appendChild(pillRow);
  }

  return card;
}

export default { renderToolCard };