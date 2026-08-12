// Workspace Header Component
// Responsible for rendering the persistent workspace header bar, status badge, meta details, and stage stepper

import { escapeHTML } from '../../utils.js';

const STATUS_STYLES = {
  DRAFT:      { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  READY:      { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  PROCESSING: { badge: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' },
  FINALIZED:  { badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
};

export function renderWorkspaceHeader(assessment, activeStage) {
  const el = (id) => document.getElementById(id);

  const titleEl = el('ws-title');
  if (titleEl) titleEl.textContent = assessment.title || 'Untitled Assessment';

  const badgeEl = el('ws-status-badge');
  if (badgeEl) {
    const s = STATUS_STYLES[assessment.status] || STATUS_STYLES.DRAFT;
    badgeEl.textContent = assessment.status || 'DRAFT';
    badgeEl.className = `px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${s.badge}`;
  }

  const metaEl = el('ws-meta');
  if (metaEl) {
    const subject = assessment.subject?.title || assessment.subjectId || '—';
    const section = assessment.section?.name || assessment.sectionId || '—';
    metaEl.innerHTML = [
      escapeHTML(subject),
      escapeHTML(section),
      escapeHTML(assessment.term || '—'),
      escapeHTML(assessment.schoolYear || '—'),
      `v${assessment.version ?? 1}`,
    ].map(v => `<span>${v}</span>`).join('<span class="mx-1 text-gray-300 dark:text-gray-700">·</span>');
  }

  const statusSelect = el('ws-status-select');
  if (statusSelect) statusSelect.value = assessment.status || 'DRAFT';

  const reopenBtn = el('btn-reopen');
  if (reopenBtn) reopenBtn.classList.toggle('hidden', assessment.status !== 'FINALIZED');

  renderStepperButtons(activeStage);
}

function renderStepperButtons(activeStage) {
  document.querySelectorAll('.ws-stage-btn').forEach(btn => {
    const isActive = btn.dataset.stage === activeStage;
    btn.classList.toggle('bg-brand-50', isActive);
    btn.classList.toggle('dark:bg-brand-900/20', isActive);
    btn.classList.toggle('text-brand-600', isActive);
    btn.classList.toggle('dark:text-brand-400', isActive);
    btn.classList.toggle('text-gray-500', !isActive);
    btn.classList.toggle('dark:text-gray-400', !isActive);
  });
}
