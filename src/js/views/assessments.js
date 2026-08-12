// Assessment Hub View Controller
// Route: /assessments.html
//
// This page is ONLY the Assessment discovery hub:
//  • List assessments with filters and KPI cards
//  • Create new assessment (modal)
//  • Row click / "Open" button → soft-navigate to /assessment-workspace.html?id=:id
//
// DO NOT add inline detail panel logic here. Detail/workspace is in assessment-workspace.js.

import { SkeletonBuilder } from '../skeletons.js';
import { ConfigStore } from '../stores/config-store.js';
import { escapeHTML } from '../utils.js';
import * as AssessmentApi from '../api/assessment-api.js';

let assessments = [];

// ─── Status badge color map ───
const STATUS_STYLES = {
  DRAFT:      { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  READY:      { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  PROCESSING: { badge: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' },
  FINALIZED:  { badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
};

function getStatusBadge(status) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
  return `<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${s.badge}">${escapeHTML(status)}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Navigate to workspace ───────────────────────────────────────────────────
function openWorkspace(id) {
  if (!id) return;
  const url = new URL('/assessment-workspace.html', window.location.origin);
  url.searchParams.set('id', id);
  // Use PJAX soft-navigation if available, otherwise fallback
  if (window.__pjaxNavigate) {
    window.__pjaxNavigate(url);
  } else {
    window.location.href = url.toString();
  }
}

// ─── PUBLIC INIT ─────────────────────────────────────────────────────────────
export function initAssessmentsView() {
  console.log('[Project KIT] Initializing Assessment Hub');
  assessments = [];
  populateFilterDropdowns();
  attachEventListeners();
  loadAssessments();
}

// ─── POPULATE FILTER DROPDOWNS FROM CONFIG STORE ─────────────────────────────
function populateFilterDropdowns() {
  const config = ConfigStore.getSafe();
  if (!config) return;

  const subjects = Array.isArray(config.subjects) ? config.subjects : [];
  const sections = Array.isArray(config.sections) ? config.sections : [];

  const filterSubject = document.getElementById('filter-subject');
  const filterSection = document.getElementById('filter-section');

  if (filterSubject) {
    filterSubject.innerHTML = '<option value="">All Subjects</option>';
    subjects.forEach(s => {
      filterSubject.innerHTML += `<option value="${escapeHTML(s.id || s.code || '')}">${escapeHTML(s.title || s.name || '')}</option>`;
    });
  }

  if (filterSection) {
    filterSection.innerHTML = '<option value="">All Sections</option>';
    sections.forEach(s => {
      filterSection.innerHTML += `<option value="${escapeHTML(s.id || s.name || '')}">${escapeHTML(s.name || '')}</option>`;
    });
  }

  const createSubject = document.getElementById('create-subject');
  const createSection = document.getElementById('create-section');

  if (createSubject) {
    createSubject.innerHTML = '<option value="" disabled selected>Select subject</option>';
    subjects.forEach(s => {
      createSubject.innerHTML += `<option value="${escapeHTML(s.id || s.code || '')}">${escapeHTML(s.title || s.name || '')}</option>`;
    });
  }

  if (createSection) {
    createSection.innerHTML = '<option value="" disabled selected>Select section</option>';
    sections.forEach(s => {
      createSection.innerHTML += `<option value="${escapeHTML(s.id || s.name || '')}">${escapeHTML(s.name || '')}</option>`;
    });
  }
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
function attachEventListeners() {
  document.getElementById('btn-create-assessment')?.addEventListener('click', openCreateModal);
  document.getElementById('btn-create-assessment-empty')?.addEventListener('click', openCreateModal);
  document.getElementById('btn-close-create-modal')?.addEventListener('click', closeCreateModal);
  document.getElementById('btn-cancel-create')?.addEventListener('click', closeCreateModal);
  document.getElementById('btn-submit-create')?.addEventListener('click', handleCreateAssessment);

  document.getElementById('filter-status')?.addEventListener('change', loadAssessments);
  document.getElementById('filter-subject')?.addEventListener('change', loadAssessments);
  document.getElementById('filter-section')?.addEventListener('change', loadAssessments);
  document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);

  let searchTimer = null;
  document.getElementById('filter-search')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderAssessmentsList(), 250);
  });

  document.getElementById('create-assessment-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreateModal();
  });
}

// ─── LOAD ASSESSMENTS ────────────────────────────────────────────────────────
async function loadAssessments() {
  const tbody = document.getElementById('assessments-tbody');
  if (tbody) tbody.innerHTML = SkeletonBuilder.renderTableRows(5, 7);

  const filters = {
    status: document.getElementById('filter-status')?.value || '',
    subjectId: document.getElementById('filter-subject')?.value || '',
    sectionId: document.getElementById('filter-section')?.value || '',
  };

  try {
    const response = await AssessmentApi.listAssessments(filters);
    assessments = Array.isArray(response?.data) ? response.data : [];
  } catch (err) {
    console.error('[Assessments Hub] Failed to load assessments', err);
    assessments = [];
  }

  renderAssessmentsList();
  updateKPIs();
}

// ─── RENDER ASSESSMENTS LIST ─────────────────────────────────────────────────
function renderAssessmentsList() {
  const tbody = document.getElementById('assessments-tbody');
  const emptyState = document.getElementById('assessments-empty-state');
  const tableWrapper = document.getElementById('assessments-table-wrapper');
  const searchTerm = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

  const filtered = searchTerm
    ? assessments.filter(a => (a.title || '').toLowerCase().includes(searchTerm))
    : assessments;

  if (!filtered.length) {
    if (tbody) tbody.innerHTML = '';
    emptyState?.classList.remove('hidden');
    tableWrapper?.classList.add('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  tableWrapper?.classList.remove('hidden');

  if (!tbody) return;

  tbody.innerHTML = filtered.map((a) => {
    const subjectName = a.subject?.title || a.subject?.code || a.subjectId || '—';
    const sectionName = a.section?.name || a.sectionId || '—';
    const responseCount = a._count?.responses ?? 0;
    const attendanceCount = a._count?.attendance ?? 0;

    return `
      <tr class="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors cursor-pointer" data-assessment-id="${a.id}">
        <td class="px-4 py-3">
          <div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">${escapeHTML(a.title || 'Untitled')}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">${escapeHTML(a.term || '')} · ${escapeHTML(a.schoolYear || '')}</p>
          </div>
        </td>
        <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-medium">${escapeHTML(subjectName)}</td>
        <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-medium">${escapeHTML(sectionName)}</td>
        <td class="px-4 py-3 text-center">${getStatusBadge(a.status || 'DRAFT')}</td>
        <td class="px-4 py-3 text-center">
          <span class="text-xs font-bold text-gray-700 dark:text-gray-300">${responseCount}</span>
          <span class="text-[10px] text-gray-400"> / ${attendanceCount}</span>
        </td>
        <td class="px-4 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400">${formatDate(a.updatedAt)}</td>
        <td class="px-4 py-3 text-center">
          <button class="btn-open-workspace px-3 py-1.5 text-[10px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 transition" data-id="${a.id}">
            Open →
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Row click → workspace
  tbody.querySelectorAll('[data-assessment-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.btn-open-workspace')) return;
      openWorkspace(parseInt(row.dataset.assessmentId));
    });
  });

  // Open button → workspace
  tbody.querySelectorAll('.btn-open-workspace').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkspace(parseInt(btn.dataset.id));
    });
  });
}

// ─── UPDATE KPI CARDS ────────────────────────────────────────────────────────
function updateKPIs() {
  const total = assessments.length;
  const drafts = assessments.filter(a => a.status === 'DRAFT').length;
  const processing = assessments.filter(a => a.status === 'PROCESSING' || a.status === 'READY').length;
  const finalized = assessments.filter(a => a.status === 'FINALIZED').length;

  const elById = (id) => document.getElementById(id);
  if (elById('kpi-total')) elById('kpi-total').textContent = total;
  if (elById('kpi-drafts')) elById('kpi-drafts').textContent = drafts;
  if (elById('kpi-processing')) elById('kpi-processing').textContent = processing;
  if (elById('kpi-finalized')) elById('kpi-finalized').textContent = finalized;

  const badge = elById('assessment-count-badge');
  if (badge) badge.textContent = `${total} assessment${total !== 1 ? 's' : ''}`;
}

// ─── CREATE MODAL ────────────────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById('create-assessment-modal')?.classList.remove('hidden');
  document.getElementById('create-title')?.focus();
}

function closeCreateModal() {
  document.getElementById('create-assessment-modal')?.classList.add('hidden');
  const elById = (id) => document.getElementById(id);
  if (elById('create-title')) elById('create-title').value = '';
  if (elById('create-subject')) elById('create-subject').selectedIndex = 0;
  if (elById('create-section')) elById('create-section').selectedIndex = 0;
  if (elById('create-target-items')) elById('create-target-items').value = '50';
  if (elById('create-passing-mps')) elById('create-passing-mps').value = '60';
}

async function handleCreateAssessment() {
  const elById = (id) => document.getElementById(id);
  const title = elById('create-title')?.value?.trim();
  const subjectId = elById('create-subject')?.value;
  const sectionId = elById('create-section')?.value;
  const term = elById('create-term')?.value;
  const schoolYear = elById('create-school-year')?.value;
  const targetItems = parseInt(elById('create-target-items')?.value) || 50;
  const passingMps = parseFloat(elById('create-passing-mps')?.value) || 60;

  if (!title || !subjectId || !sectionId || !term || !schoolYear) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  const btn = elById('btn-submit-create');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Creating...`;
  }

  try {
    const res = await AssessmentApi.createAssessment({ title, subjectId, sectionId, term, schoolYear, targetItems, passingMps });
    closeCreateModal();
    showToast('Assessment created! Opening workspace…', 'success');

    // Navigate to the new assessment workspace
    const newId = res?.data?.id;
    if (newId) {
      setTimeout(() => openWorkspace(newId), 600);
    } else {
      await loadAssessments();
    }
  } catch (err) {
    console.error('[Assessments Hub] Create failed', err);
    showToast(err?.message || 'Failed to create assessment', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Create Assessment`;
    }
  }
}

// ─── FILTER HELPERS ───────────────────────────────────────────────────────────
function clearFilters() {
  const elById = (id) => document.getElementById(id);
  if (elById('filter-status')) elById('filter-status').value = '';
  if (elById('filter-subject')) elById('filter-subject').value = '';
  if (elById('filter-section')) elById('filter-section').value = '';
  if (elById('filter-search')) elById('filter-search').value = '';
  loadAssessments();
}

// ─── TOAST HELPER ────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const t = document.createElement('div');
  t.className = `fixed bottom-6 right-6 z-99999 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white transition-all duration-300 transform ${
    type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800'
  }`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}
