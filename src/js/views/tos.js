import { getCompetencies as fetchCompetencies, getTosDocuments, upsertTosDocument } from '../api/tos-api.js';
import { NoData } from '../components/no-data.js';
import { ConfigStore } from '../stores/config-store.js';
import { ensureAddSectionsLink, escapeHTML, selectValueOrEmpty } from '../utils.js';
import { printElement } from '../components/print-engine.js';

let TOS_COMPETENCY_DATABASE = {};

/** Index of saved TOS documents in the backend, keyed by subject|term|schoolYear */
let savedDocuments = new Map();
let currentDocumentId = null;
let autosaveTimer = null;
let autosaveInFlight = false;
let autosavePending = false;

let competenciesLoadPromise = null;

/**
 * Loads the competency database from the backend. The request is shared and
 * memoized so every view (TOS worksheet, item analysis, ...) awaits the same
 * in-flight request instead of issuing duplicate network calls.
 */
export function loadCompetencies() {
  if (!competenciesLoadPromise) {
    competenciesLoadPromise = (async () => {
      try {
        const response = await fetchCompetencies();
        if (response?.success && response.data && typeof response.data === 'object') {
          TOS_COMPETENCY_DATABASE = response.data;
          return;
        }
      } catch (error) {
        console.warn('[TOSView] Failed to load competencies from backend', error);
      }

      TOS_COMPETENCY_DATABASE = {};
    })();
  }
  return competenciesLoadPromise;
}

async function loadSavedDocumentsIndex() {
  try {
    const response = await getTosDocuments();
    if (response?.success && Array.isArray(response.data)) {
      const map = new Map();
      for (const doc of response.data) {
        map.set(`${doc.subject}|${doc.term}|${doc.schoolYear}`, doc);
      }
      return map;
    }
  } catch (error) {
    console.warn('[TOSView] Failed to load saved TOS documents', error);
  }
  return new Map();
}

/** Generate dynamic fallback competencies for custom Subject/Quarter/Strand/Section combinations */
export function getCompetenciesForContext(subject, term, schoolYear, grade, strand, section) {
  const subjectEntry = TOS_COMPETENCY_DATABASE[subject];
  let baseComps = [];

  if (subjectEntry && subjectEntry[term]) {
    baseComps = JSON.parse(JSON.stringify(subjectEntry[term]));
  } else {
    // If there is no backend competency data for the selected subject/term,
    // return an empty list so the UI clearly communicates missing data.
    return [];
  }

  // Customize competencies according to Strand and Section context
  const cleanStrand = (strand || 'TVL').replace(/[^a-zA-Z]/g, '');
  const cleanSection = (section || '').replace(/[^a-zA-Z0-9-]/g, '');

  return baseComps.map((comp, idx) => {
    let modifiedDesc = comp.description;
    if (strand && !modifiedDesc.includes(strand)) {
      if (idx === 0 && strand.includes('STEM')) {
        modifiedDesc += ` (STEM Scientific Focus)`;
      } else if (idx === 0 && strand.includes('ICT')) {
        modifiedDesc += ` (Technical Hands-on Application)`;
      } else if (idx === 0 && strand.includes('HUMSS')) {
        modifiedDesc += ` (Humanities & Qualitative Analysis)`;
      }
    }
    return {
      ...comp,
      code: comp.code.includes('/') ? comp.code : `${comp.code}-${cleanSection || cleanStrand}`,
      description: modifiedDesc
    };
  });
}

export let competenciesStore = [];
export let documentState = 'Draft';
let isTableEditing = false;
let allocationMode = 'manual';
let selectedRowIds = new Set();
let pendingDeleteIds = [];
let activeViewMode = 'worksheet';

/** Allow external callers (setup-tos.js) to seed the TOS store and fully reset state */
export function setTOSContext({ rows = [], state = 'Draft', assessmentIdOverride = null } = {}) {
  competenciesStore = rows;
  documentState = state;
  isTableEditing = false;
  allocationMode = 'manual';
  selectedRowIds = new Set();
  pendingDeleteIds = [];
  activeViewMode = 'worksheet';
  if (assessmentIdOverride !== null) fromAssessmentId = assessmentIdOverride;
}

/** Toggle edit mode from an external host (workspace TOS panel) */
export function setIsTableEditing(on) {
  isTableEditing = Boolean(on);
}

// Allow setup-tos.js to flip edit mode via window event (avoids circular imports)
window.addEventListener('tos:set-edit-mode', (e) => {
  isTableEditing = Boolean(e.detail?.on);
});

// ── From-assessment deep-link context ────────────────────────────────────────
// Set when tos.html is opened via "Create TOS" from the workspace deep-link
// e.g. tos.html?from=42&subject=Math&term=First+Quarter&sy=2025-2026
let fromAssessmentId = null;

function parseFromAssessmentParams() {
  const params = new URLSearchParams(window.location.search);
  fromAssessmentId = params.get('from') ? Number(params.get('from')) : null;
  return {
    subject: params.get('subject') || null,
    term: params.get('term') || null,
    sy: params.get('sy') || null,
  };
}

export async function initTOSView() {
  console.log('[Project KIT] Initializing Professional TOS Document Editor');

  // Parse deep-link context BEFORE anything else
  const fromParams = parseFromAssessmentParams();
  if (fromAssessmentId) {
    // Show a banner so the teacher knows they can return to the workspace
    showReturnBanner(fromAssessmentId, false);
  }

  // Bind static buttons/popups FIRST so they respond immediately — even while
  // competency data is still loading from the backend (prevents dead buttons).
  bindStaticControls();
  addTOSGridEventListeners();

  await Promise.all([loadCompetencies(), loadSavedDocumentsIndex()]);

  // Bind Header Picklists from ConfigStore
  const config = ConfigStore.getSafe();
  const subSelect = document.getElementById('info-subject');
  const secSelect = document.getElementById('info-section');
  const teacherSelect = document.getElementById('info-teacher');
  const sySelect = document.getElementById('info-school-year');
  const gradeSelect = document.getElementById('info-grade-level');
  const termSelect = document.getElementById('info-term');
  const strandSelect = document.getElementById('info-strand');

  if (subSelect && config.subjects) {
    subSelect.innerHTML = config.subjects.map(s => `<option value="${s.title}">${s.title}</option>`).join('');
  }

  const updateSectionOptions = (selectedStrand, selectedGrade) => {
    if (!secSelect) return;
    const strandNormalized = (selectedStrand || '').replace(/\s+-\s+/g, '-').trim().toLowerCase();
    const gradeNum = (selectedGrade || '').replace(/\D/g, '');

    const matchingSections = (config.sections || []).filter(sec => {
      const secStrandNormalized = (sec.strand || '').replace(/\s+-\s+/g, '-').trim().toLowerCase();
      const matchesStrand = !strandNormalized || 
             secStrandNormalized.includes(strandNormalized) || 
             strandNormalized.includes(secStrandNormalized);

      if (!matchesStrand) return false;

      if (!gradeNum) return true;
      const secGradeNum = (sec.grade || '').replace(/\D/g, '');
      if (secGradeNum) return secGradeNum === gradeNum;
      const secNamePrefix = (sec.name || '').split('-')[0].replace(/\D/g, '');
      if (secNamePrefix) return secNamePrefix === gradeNum;
      return true;
    });

    if (!matchingSections || matchingSections.length === 0) {
      secSelect.innerHTML = `<option value="">— No sections —</option>`;
      secSelect.disabled = true;
      ensureAddSectionsLink(secSelect);
      return;
    }

    secSelect.disabled = false;
    secSelect.innerHTML = matchingSections.map(s => `<option value="${s.name}">${s.name} (${s.strand})</option>`).join('');
    ensureAddSectionsLink(secSelect);
  };

  if (strandSelect && gradeSelect) {
    updateSectionOptions(strandSelect.value, gradeSelect.value);
    ensureAddSectionsLink(secSelect);
  }

  if (teacherSelect && config.faculty) {
    teacherSelect.innerHTML = `<option value="${config.faculty.teacherName}">${config.faculty.teacherName}</option>`;
  }

  if (sySelect && config.academicPeriod) {
    sySelect.value = config.academicPeriod.schoolYear || '2025–2026';
  }

  if (termSelect && config.academicPeriod) {
    termSelect.value = config.academicPeriod.term || 'First Quarter';
  }

  // ── Apply deep-link pre-fill AFTER defaults so workspace context wins ───────
  if (fromParams.subject && subSelect) {
    // Try exact match first; TOS editor subjects are titles like "Empowerment Technologies"
    const opt = Array.from(subSelect.options).find(o => o.value === fromParams.subject);
    if (opt) subSelect.value = fromParams.subject;
  }
  if (fromParams.term && termSelect) {
    const opt = Array.from(termSelect.options).find(o => o.value === fromParams.term);
    if (opt) termSelect.value = fromParams.term;
  }
  if (fromParams.sy && sySelect) {
    sySelect.value = fromParams.sy;
  }

  /** Reload competencies and re-render grid whenever ANY picklist changes */
  const handleContextChange = (isInitial = false) => {
    const subject = subSelect?.value || 'Empowerment Technologies';
    const term = termSelect?.value || 'First Quarter';
    const schoolYear = sySelect?.value || '2025–2026';
    const grade = gradeSelect?.value || 'Grade 11';
    const strand = strandSelect?.value || 'TVL - ICT';
    // If the section select is disabled or has no value, pass an empty section so
    // getCompetenciesForContext won't attempt to match every section.
    const section = selectValueOrEmpty(secSelect);

    // Save to ConfigStore
    if (config.academicPeriod) {
      config.academicPeriod.schoolYear = schoolYear;
      config.academicPeriod.term = term;
      ConfigStore.save(config);
    }

    // Restore the persisted status of the document for this context, if any
    const savedDoc = savedDocuments.get(`${subject}|${term}|${schoolYear}`);
    currentDocumentId = savedDoc?.id ?? null;
    documentState = savedDoc?.status || 'Draft';
    updateDocumentStatusUI(documentState);

    // Load new competencies matching context
    competenciesStore = getCompetenciesForContext(subject, term, schoolYear, grade, strand, section);

    // Update target hours/items from subject definition if available
    const selectedSubObj = config.subjects?.find(s => s.title === subject);
    if (selectedSubObj) {
      const targetHoursInput = document.getElementById('tos-target-hours');
      const targetItemsInput = document.getElementById('tos-total-items');
      if (targetHoursInput) targetHoursInput.value = selectedSubObj.targetHours;
      if (targetItemsInput) targetItemsInput.value = selectedSubObj.targetItems;
    }

    if (allocationMode === 'hamilton') {
      applyHamiltonAllocation();
    }

    renderTOSGrid();
    if (activeViewMode === 'preview') {
      renderOfficialDepEdPreview();
    }
    updateLiveValidation();
    if (!isInitial) {
      triggerAutoSave();
    }
  };

  // Attach strand/grade listener to update section dropdown dynamically
  if (strandSelect) {
    strandSelect.addEventListener('change', () => {
      updateSectionOptions(strandSelect.value, gradeSelect?.value);
      handleContextChange();
    });
  }

  if (gradeSelect) {
    gradeSelect.addEventListener('change', () => {
      updateSectionOptions(strandSelect?.value, gradeSelect.value);
      handleContextChange();
    });
  }

  // Attach change listeners to all context picklists
  [subSelect, sySelect, gradeSelect, termSelect, secSelect].forEach(element => {
    if (element) {
      element.addEventListener('change', handleContextChange);
    }
  });

  // Initial load (does not save anything to the backend)
  handleContextChange(true);
  updateDocumentStatusUI(documentState);
}

/**
 * Binds all static page controls (buttons, modals, drawers, toggles).
 * Runs synchronously BEFORE any async data fetch so popups and buttons always
 * respond immediately, even when the backend is slow or unavailable.
 */
function bindStaticControls() {
  // Page-Level Edit / Save Toggle Button
  const btnEditToggle = document.getElementById('btn-edit-tos-toggle');
  if (btnEditToggle) {
    btnEditToggle.addEventListener('click', handleEditToggleClick);
  }

  // Cancel Edit Button
  const btnCancel = document.getElementById('btn-cancel-tos-edit');
  if (btnCancel) {
    btnCancel.addEventListener('click', cancelTableEditMode);
  }

  // View Mode Switcher Buttons
  const btnViewWorksheet = document.getElementById('btn-view-worksheet');
  const btnViewPreview = document.getElementById('btn-view-preview');
  const btnFooterSave = document.getElementById('btn-footer-save');

  if (btnViewWorksheet && btnViewPreview) {
    btnViewWorksheet.addEventListener('click', () => switchViewMode('worksheet'));
    btnViewPreview.addEventListener('click', () => switchViewMode('preview'));
  }

  if (btnFooterSave) {
    btnFooterSave.addEventListener('click', () => {
      triggerAutoSave();
      showToast('Worksheet saved successfully!', 'success');
    });
  }

  // Help Drawer Controls
  const btnOpenHelp = document.getElementById('btn-open-help-drawer');
  const btnCloseHelp = document.getElementById('btn-close-help-drawer');
  const helpDrawer = document.getElementById('tos-help-drawer');

  if (btnOpenHelp && helpDrawer) {
    btnOpenHelp.addEventListener('click', () => helpDrawer.classList.remove('hidden'));
  }
  if (btnCloseHelp && helpDrawer) {
    btnCloseHelp.addEventListener('click', () => helpDrawer.classList.add('hidden'));
  }

  // Unlock Document Audit Modal Controls
  const btnUnlockDoc = document.getElementById('btn-unlock-doc');
  const modalUnlock = document.getElementById('unlock-reason-modal');
  const btnCancelUnlock = document.getElementById('btn-cancel-unlock');
  const btnConfirmUnlock = document.getElementById('btn-confirm-unlock');

  if (btnUnlockDoc && modalUnlock) {
    btnUnlockDoc.addEventListener('click', () => modalUnlock.classList.remove('hidden'));
  }
  if (btnCancelUnlock && modalUnlock) {
    btnCancelUnlock.addEventListener('click', () => modalUnlock.classList.add('hidden'));
  }
  if (btnConfirmUnlock && modalUnlock) {
    btnConfirmUnlock.addEventListener('click', confirmUnlockDocument);
  }

  // Allocation Mode Radio Change
  const modeRadios = document.querySelectorAll('input[name="alloc-mode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      allocationMode = e.target.value;
      if (allocationMode === 'hamilton') {
        applyHamiltonAllocation();
      }
      renderTOSGrid();
      triggerAutoSave();
    });
  });

  // Select All Checkbox Listener
  const selectAllCb = document.getElementById('select-all-tos-rows');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      if (isChecked) {
        competenciesStore.forEach(c => selectedRowIds.add(c.id));
      } else {
        selectedRowIds.clear();
      }
      updateBulkActionBar();
      renderTOSGrid();
    });
  }

  // Bulk Action Buttons
  const btnBulkDelete = document.getElementById('btn-tos-bulk-delete');
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', () => {
      pendingDeleteIds = Array.from(selectedRowIds);
      document.getElementById('delete-tos-confirm-modal')?.classList.remove('hidden');
    });
  }

  const btnConfirmDelete = document.getElementById('btn-confirm-delete-tos-rows');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', confirmBulkDeleteRows);
  }

  const btnBulkDuplicate = document.getElementById('btn-tos-bulk-duplicate');
  if (btnBulkDuplicate) {
    btnBulkDuplicate.addEventListener('click', bulkDuplicateRows);
  }

  // Form Inputs Auto-Save and Validation
  const targetItemsInput = document.getElementById('tos-total-items');
  if (targetItemsInput) {
    targetItemsInput.addEventListener('input', () => {
      if (allocationMode === 'hamilton') applyHamiltonAllocation();
      updateLiveValidation();
      triggerAutoSave();
    });
  }

  const targetHoursInput = document.getElementById('tos-target-hours');
  if (targetHoursInput) {
    targetHoursInput.addEventListener('input', () => {
      updateLiveValidation();
      triggerAutoSave();
    });
  }

  // TOS print — isolated iframe print of just the DepEd TOS card
  const btnPrintTos = document.getElementById('btn-print-tos');
  if (btnPrintTos) {
    btnPrintTos.addEventListener('click', () => {
      printElement('official-tos-card', { title: 'Table of Specifications' });
    });
  }
}

export function switchViewMode(mode) {
  activeViewMode = mode;
  const worksheetContainer = document.getElementById('worksheet-view-container');
  const previewContainer = document.getElementById('print-preview-container');
  const btnWorksheet = document.getElementById('btn-view-worksheet');
  const btnPreview = document.getElementById('btn-view-preview');

  if (!worksheetContainer || !previewContainer) return;

  if (mode === 'preview') {
    worksheetContainer.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    btnWorksheet.className = 'px-3 py-1.5 rounded-lg font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition';
    btnPreview.className = 'px-3 py-1.5 rounded-lg font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs transition';
    renderOfficialDepEdPreview();
  } else {
    previewContainer.classList.add('hidden');
    worksheetContainer.classList.remove('hidden');
    btnPreview.className = 'px-3 py-1.5 rounded-lg font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition';
    btnWorksheet.className = 'px-3 py-1.5 rounded-lg font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs transition';
  }
  // Keep doc-status-tag updated on every view switch
  updateDocumentStatusUI(documentState);
}

/**
 * ARCH-001: Adds delegated event listeners to the TOS grid to handle all user
 * interactions without polluting the global scope or using inline handlers.
 */
export function addTOSGridEventListeners() {
  const tableBody = document.getElementById('tos-competency-tbody');
  if (!tableBody) return;
  // Guard against duplicate registration (e.g. PJAX re-render or workspace re-init)
  if (tableBody.dataset.tosListening) return;
  tableBody.dataset.tosListening = '1';

  // Live input handler for all cells in edit mode
  tableBody.addEventListener('input', (e) => {
    if (isTableEditing && e.target.matches('.kit-grid-cell')) {
      onDomainInputChanged();
    }
  });

  // Checkbox change handler
  tableBody.addEventListener('change', (e) => {
    const checkbox = e.target;
    if (checkbox.matches('.row-checkbox')) {
      toggleTOSRowSelect(checkbox.value, checkbox.checked);
    }
  });

  // Click handler for the inline "Add Row" button
  tableBody.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action="commit-inline-new"]');
    if (button) {
      commitInlineNewRow();
    }
  });

  // Keydown handler for the inline add row inputs (for Enter key)
  tableBody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;

    const input = e.target;
    if (
      input.matches('#inline-new-code') ||
      input.matches('#inline-new-desc') ||
      input.matches('#inline-new-hours') ||
      input.matches('[id^="inline-new-"]') // Catches all domain inputs
    ) {
      e.preventDefault();
      commitInlineNewRow();
    }
  });
}

function handleEditToggleClick() {
  if (documentState === 'Finalized') {
    document.getElementById('unlock-reason-modal')?.classList.remove('hidden');
    return;
  }

  if (!isTableEditing) {
    isTableEditing = true;
    updateEditButtonUI(true);
  } else {
    commitTableEdits();
    isTableEditing = false;
    updateEditButtonUI(false);
    triggerAutoSave();
    showToast('Worksheet document changes saved successfully.');
  }
  renderTOSGrid();
}

function cancelTableEditMode() {
  isTableEditing = false;
  updateEditButtonUI(false);
  renderTOSGrid();
  showToast('Edits cancelled.');
}

function updateEditButtonUI(editing) {
  const btnToggle = document.getElementById('btn-edit-tos-toggle');
  const btnCancel = document.getElementById('btn-cancel-tos-edit');

  if (!btnToggle) return;

  if (editing) {
    btnToggle.className = 'px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs transition flex items-center gap-1.5';
    btnToggle.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      Save Changes
    `;
    if (btnCancel) btnCancel.classList.remove('hidden');
  } else {
    btnToggle.className = 'px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-xs transition flex items-center gap-1.5';
    btnToggle.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
      Edit Worksheet
    `;
    if (btnCancel) btnCancel.classList.add('hidden');
  }
}

function confirmUnlockDocument() {
  const reason = document.getElementById('unlock-reason-text')?.value;
  if (!reason || !reason.trim()) {
    showToast('Please specify a reason for unlocking the document.');
    return;
  }

  documentState = 'Draft';
  updateDocumentStatusUI('Draft');
  document.getElementById('unlock-reason-modal')?.classList.add('hidden');
  document.getElementById('btn-unlock-doc')?.classList.add('hidden');
  document.getElementById('btn-edit-tos-toggle')?.classList.remove('hidden');

  showToast(`Document unlocked: "${reason.substring(0, 30)}..."`);
  triggerAutoSave();
}

function updateDocumentStatusUI(status) {
  const statusTag = document.getElementById('doc-status-tag');
  if (statusTag) {
    statusTag.textContent = status.toUpperCase();
  }
}

export function triggerAutoSave() {
  const dot = document.getElementById('autosave-dot');
  const text = document.getElementById('autosave-text');

  if (!dot || !text) return;

  dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
  text.textContent = '● Saving...';

  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (autosaveInFlight) {
      autosavePending = true;
      return;
    }
    performAutoSave();
  }, 800);
}

// ── Return-to-assessment banner ──────────────────────────────────────────────
function showReturnBanner(assessmentId, saved = false) {
  const bannerId = 'tos-return-banner';
  let banner = document.getElementById(bannerId);
  const returnUrl = `assessment-workspace.html?id=${assessmentId}`;
  if (!banner) {
    banner = document.createElement('div');
    banner.id = bannerId;
    banner.className = 'fixed top-0 inset-x-0 z-[99999] flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold bg-brand-600 text-white shadow-lg';
    document.body.prepend(banner);
  }
  banner.innerHTML = saved
    ? `<span class="flex items-center gap-2">
        <svg class="w-4 h-4 text-brand-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        TOS saved &amp; linked to assessment
       </span>
       <a href="${returnUrl}" class="px-3 py-1 rounded-lg bg-white text-brand-700 font-bold hover:bg-brand-50 transition shrink-0">
         ← Return to Assessment
       </a>`
    : `<span class="flex items-center gap-2">
        <svg class="w-4 h-4 text-brand-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Opened from Assessment Workspace — save here to link automatically
       </span>
       <a href="${returnUrl}" class="px-3 py-1 rounded-lg bg-white/20 text-white font-bold hover:bg-white/30 transition shrink-0">
         ← Back without saving
       </a>`;
}

async function performAutoSave() {
  autosaveInFlight = true;
  try {
    const saved = await upsertTosDocument(buildDocumentPayload());
    if (saved?.success && saved.data) {
      const doc = saved.data;
      savedDocuments.set(`${doc.subject}|${doc.term}|${doc.schoolYear}`, doc);
      currentDocumentId = doc.id;
      documentState = doc.status || documentState;
      updateDocumentStatusUI(documentState);

      const dot = document.getElementById('autosave-dot');
      const text = document.getElementById('autosave-text');
      const time = document.getElementById('autosave-time');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
      if (text) text.textContent = '✓ Saved';
      const now = new Date();
      if (time) time.textContent = `· ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      // If opened from workspace, show/update the Return banner
      if (fromAssessmentId) showReturnBanner(fromAssessmentId, true);
    } else {
      setAutosaveError();
    }
  } catch (error) {
    console.warn('[TOSView] Autosave failed', error);
    setAutosaveError();
  } finally {
    autosaveInFlight = false;
    if (autosavePending) {
      autosavePending = false;
      autosaveTimer = setTimeout(performAutoSave, 300);
    }
  }
}

function setAutosaveError() {
  const dot = document.getElementById('autosave-dot');
  const text = document.getElementById('autosave-text');
  if (dot) dot.className = 'w-2 h-2 rounded-full bg-red-500';
  if (text) text.textContent = '✗ Save failed';
}

export function buildDocumentPayload() {
  const getValue = (id, fallback) => document.getElementById(id)?.value || fallback;
  const subject = getValue('info-subject', 'Empowerment Technologies');
  const term = getValue('info-term', 'First Quarter');
  const schoolYear = getValue('info-school-year', '2025–2026');
  const grade = getValue('info-grade-level', '');
  const strand = getValue('info-strand', '');
  const section = getValue('info-section', '');
  const targetHours = Number(document.getElementById('tos-target-hours')?.value) || 40;
  const targetItems = Number(document.getElementById('tos-total-items')?.value) || 40;

  const rows = (competenciesStore || [])
    .filter(row => row && row.description && String(row.description).trim() !== '')
    .map(row => ({ ...row }));

  return {
    subject,
    term,
    schoolYear,
    grade,
    strand,
    section,
    targetHours,
    targetItems,
    status: documentState,
    rows,
    // Stamp the assessment link if this TOS was opened from a workspace
    ...(fromAssessmentId ? { assessmentId: fromAssessmentId } : {}),
  };
}

function applyHamiltonAllocation() {
  const targetItemsInput = document.getElementById('tos-total-items');
  const targetN = targetItemsInput ? Number(targetItemsInput.value) || 40 : 40;
  const targetHoursInput = document.getElementById('tos-target-hours');
  const targetHours = targetHoursInput ? Number(targetHoursInput.value) || 40 : 40;

  if (targetHours === 0) return;

  // Hamilton Largest Remainder Method based on Target Course Hours
  let allocated = 0;
  competenciesStore = competenciesStore.map(c => {
    const rawExact = (c.hours / targetHours) * targetN;
    const itemTarget = Math.round(rawExact);
    allocated += itemTarget;

    // Distribute proportionally across domains using floor + remainder
    // to guarantee domain sum === itemTarget for all values including 1, 2
    const rem = Math.floor(itemTarget * 0.3);
    const und = Math.floor(itemTarget * 0.3);
    const app = Math.floor(itemTarget * 0.2);
    const ana = itemTarget - (rem + und + app); // absorbs all rounding remainder

    return {
      ...c,
      domains: { remembering: rem, understanding: und, applying: app, analyzing: ana, evaluating: 0, creating: 0 }
    };
  });
}

// Safe integer parser — returns fallback on NaN, undefined, or empty string
function safeInt(val, fallback = 0) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

export function commitTableEdits() {
  competenciesStore = competenciesStore.map(c => {
    const codeEl = document.getElementById(`edit-code-${c.id}`);
    const descEl = document.getElementById(`edit-desc-${c.id}`);
    const hoursEl = document.getElementById(`edit-hours-${c.id}`);

    if (!codeEl) return c;

    return {
      ...c,
      code: codeEl.value || c.code,
      description: descEl.value || c.description,
      hours: safeInt(hoursEl?.value, c.hours || 4),
      domains: {
        remembering: safeInt(document.getElementById(`edit-rem-${c.id}`)?.value, 0),
        understanding: safeInt(document.getElementById(`edit-und-${c.id}`)?.value, 0),
        applying: safeInt(document.getElementById(`edit-app-${c.id}`)?.value, 0),
        analyzing: safeInt(document.getElementById(`edit-ana-${c.id}`)?.value, 0),
        evaluating: safeInt(document.getElementById(`edit-eva-${c.id}`)?.value, 0),
        creating: safeInt(document.getElementById(`edit-cre-${c.id}`)?.value, 0),
      }
    };
  });
}

// Returns expected target items for a competency based on allocation mode
function getExpectedItems(comp) {
  if (allocationMode === 'hamilton') {
    const targetItemsInput = document.getElementById('tos-total-items');
    const targetN = targetItemsInput ? Number(targetItemsInput.value) || 40 : 40;
    const targetHoursInput = document.getElementById('tos-target-hours');
    const targetHours = targetHoursInput ? Number(targetHoursInput.value) || 40 : 40;
    return targetHours > 0 ? Math.round((comp.hours / targetHours) * targetN) : comp.hours;
  }
  
  // Manual Mode: preserve current domain allocation target so hours editing does not corrupt items
  const domainSum = Object.values(comp.domains).reduce((a, b) => a + Number(b), 0);
  if (typeof comp.itemTarget === 'number') {
    return comp.itemTarget;
  }
  return domainSum > 0 ? domainSum : comp.hours;
}

// Helper to compute comprehensive row-level validation status
function getRowValidationStatus(comp, totalHours, targetHours, expectedItems, totalRows) {
  const currentDomainSum = Object.values(comp.domains).reduce((a, b) => a + Number(b), 0);
  const isDomainMatch = currentDomainSum === expectedItems;
  const isDomainOver = currentDomainSum > expectedItems;
  const isHoursZero = !comp.hours || comp.hours <= 0;
  const isHoursOverflow = totalHours > targetHours;
  const isHoursDeficit = totalHours < targetHours;

  const avgHours = totalHours / Math.max(1, totalRows || 1);
  const isRowHoursExcessive = isHoursOverflow && comp.hours >= avgHours;

  let statusBadge = '';
  let isRowError = false;

  if (isHoursZero) {
    statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400" title="Row hours cannot be 0">❌ 0 Hours</span>`;
    isRowError = true;
  } else if (!isDomainMatch) {
    isRowError = true;
    if (isDomainOver) {
      const overflow = currentDomainSum - expectedItems;
      statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400" title="Domain sum (${currentDomainSum}) exceeds expected items (${expectedItems}) by +${overflow}">❌ Sum: ${currentDomainSum} (+${overflow})</span>`;
    } else {
      const deficit = expectedItems - currentDomainSum;
      statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" title="Domain sum (${currentDomainSum}) is ${deficit} items below expected items (${expectedItems})">⚠ Sum: ${currentDomainSum} (-${deficit})</span>`;
    }
  } else {
    // Row itself has valid hours (>0) and matching domain items
    statusBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">✓ Valid</span>`;
  }

  return {
    currentDomainSum,
    isDomainMatch,
    isDomainOver,
    isHoursZero,
    isHoursOverflow,
    isHoursDeficit,
    isRowHoursExcessive,
    statusBadge,
    isRowError
  };
}

export function renderTOSGrid() {
  const container = document.getElementById('tos-competency-tbody');
  if (!container) return;

  const secSelect = document.getElementById('info-section');
  const strandSelect = document.getElementById('info-strand');
  if (secSelect?.disabled || !selectValueOrEmpty(secSelect)) {
    const strand = strandSelect?.value || 'selected strand';
    container.innerHTML = NoData.renderTableRow(12, `No classes available for ${escapeHTML(strand)}`, 'There are no classes found for this strand. Select a different strand or add sections in School Settings.', 'Open School Settings', 'config.html#sections');
    return;
  }

  const targetItemsInput = document.getElementById('tos-total-items');
  const targetN = targetItemsInput ? Number(targetItemsInput.value) || 40 : 40;
  const targetHoursInput = document.getElementById('tos-target-hours');
  const targetHours = targetHoursInput ? Number(targetHoursInput.value) || 40 : 40;
  const totalHours = competenciesStore.reduce((acc, c) => acc + c.hours, 0);

  const domainKeys = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  const domainAbbr = ['rem', 'und', 'app', 'ana', 'eva', 'cre'];
  const domainColors = ['blue', 'indigo', 'purple', 'amber', 'rose', 'emerald'];

  let rowsHtml = competenciesStore.map((comp) => {
    const isSelected = selectedRowIds.has(comp.id);
    const expectedItems = getExpectedItems(comp);

    const rowVal = getRowValidationStatus(comp, totalHours, targetHours, expectedItems, competenciesStore.length);
    const { currentDomainSum, isDomainOver, isHoursZero, isRowHoursExcessive, isHoursOverflow: totalHoursOverflow, isHoursDeficit: totalHoursDeficit, statusBadge, isRowError } = rowVal;

    let hoursClass = `kit-grid-cell w-14 text-center px-1 py-1 text-xs font-bold rounded transition-colors `;
    if (isHoursZero) {
      hoursClass += `border-2 border-rose-500 bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-400/50 font-extrabold`;
    } else {
      hoursClass += `border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white`;
    }

    let trClass = 'border-b border-stroke dark:border-strokedark ';
    if (isDomainOver || isHoursZero) {
      trClass += 'bg-rose-50/40 dark:bg-rose-900/20 border-l-4 border-l-rose-500';
    } else if (isRowError) {
      trClass += 'bg-amber-50/30 dark:bg-amber-900/10 border-l-4 border-l-amber-400';
    } else {
      trClass += 'hover:bg-gray-50 dark:hover:bg-gray-800';
    }

    if (isTableEditing) {
      // Build cell inputs with live error highlighting
      const domainInputsHtml = domainKeys.map((dk, i) => {
        const val = comp.domains[dk];
        const abbr = domainAbbr[i];
        const color = domainColors[i];
        const isCellOver = val > expectedItems || (val > 0 && isDomainOver);

        let cellClass = `kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded font-semibold transition-colors `;
        if (isCellOver) {
          cellClass += `border-2 border-rose-500 bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-400/50 font-extrabold`;
        } else {
          cellClass += `border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-${color}-600`;
        }

        return `<td class="px-1 py-2 text-center"><input type="number" id="edit-${abbr}-${comp.id}" value="${val}" min="0" class="${cellClass}" title="${isCellOver ? `Value ${val} causes row allocation error` : ''}" /></td>`;
      }).join('');

      return `
        <tr id="row-${comp.id}" class="${trClass}">
          <td class="px-3 py-2 text-center">
            <input type="checkbox" value="${escapeHTML(comp.id)}" ${isSelected ? 'checked' : ''} class="row-checkbox rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500" />
          </td>
          <td class="px-2 py-2">
            <input type="text" id="edit-code-${escapeHTML(comp.id)}" value="${escapeHTML(comp.code)}" class="kit-grid-cell w-full px-2 py-1 text-xs font-mono font-semibold rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          </td>
          <td class="px-2 py-2">
            <input type="text" id="edit-desc-${escapeHTML(comp.id)}" value="${escapeHTML(comp.description)}" class="kit-grid-cell w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          </td>
          <td class="px-2 py-2 text-center">
            <input type="number" id="edit-hours-${escapeHTML(comp.id)}" value="${comp.hours}" min="1" class="${hoursClass}" title="${isRowHoursExcessive ? `Hours (${comp.hours}h) contribute to total hours overflow` : ''}" />
          </td>
          <td id="items-cell-${escapeHTML(comp.id)}" class="px-2 py-2 text-center font-bold text-xs ${isDomainOver ? 'text-rose-600 font-extrabold' : 'text-brand-500'}">${expectedItems}</td>
          ${domainInputsHtml}
          <td id="status-cell-${escapeHTML(comp.id)}" class="px-3 py-2 text-center">${statusBadge}</td>
        </tr>
      `;
    }

    return `
      <tr id="row-${comp.id}" class="${trClass}">
        <td class="px-3 py-3 text-center">
          <input type="checkbox" value="${escapeHTML(comp.id)}" ${isSelected ? 'checked' : ''} class="row-checkbox rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500" />
        </td>
        <td class="px-3 py-3 text-xs font-semibold text-brand-500 font-mono">${escapeHTML(comp.code)}</td>
        <td class="px-4 py-3 text-xs text-gray-800 dark:text-gray-200 font-medium">${escapeHTML(comp.description)}</td>
        <td class="px-3 py-3 text-center text-xs font-semibold ${isRowHoursExcessive ? 'text-rose-600 font-extrabold' : ''}">${comp.hours} hrs</td>
        <td class="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-white">${expectedItems}</td>
        <td class="px-2 py-3 text-center text-xs ${comp.domains.remembering > expectedItems ? 'font-black text-rose-600 bg-rose-50 rounded' : comp.domains.remembering > 0 ? 'font-bold text-blue-600' : 'text-gray-300 dark:text-gray-600'}">${comp.domains.remembering}</td>
        <td class="px-2 py-3 text-center text-xs ${comp.domains.understanding > expectedItems ? 'font-black text-rose-600 bg-rose-50 rounded' : comp.domains.understanding > 0 ? 'font-bold text-indigo-600' : 'text-gray-300 dark:text-gray-600'}">${comp.domains.understanding}</td>
        <td class="px-2 py-3 text-center text-xs ${comp.domains.applying > expectedItems ? 'font-black text-rose-600 bg-rose-50 rounded' : comp.domains.applying > 0 ? 'font-bold text-purple-600' : 'text-gray-300 dark:text-gray-600'}">${comp.domains.applying}</td>
        <td class="px-2 py-3 text-center text-xs ${comp.domains.analyzing > expectedItems ? 'font-black text-rose-600 bg-rose-50 rounded' : comp.domains.analyzing > 0 ? 'font-bold text-amber-600' : 'text-gray-300 dark:text-gray-600'}">${comp.domains.analyzing}</td>
        <td class="px-2 py-3 text-center text-xs ${comp.domains.evaluating > expectedItems ? 'font-black text-rose-600 bg-rose-50 rounded' : comp.domains.evaluating > 0 ? 'font-bold text-rose-600' : 'text-gray-300 dark:text-gray-600'}">${comp.domains.evaluating}</td>
        <td class="px-2 py-3 text-center text-xs ${comp.domains.creating > expectedItems ? 'font-black text-rose-600 bg-rose-50 rounded' : comp.domains.creating > 0 ? 'font-bold text-emerald-600' : 'text-gray-300 dark:text-gray-600'}">${comp.domains.creating}</td>
        <td id="status-cell-${escapeHTML(comp.id)}" class="px-3 py-3 text-center">${statusBadge}</td>
      </tr>
    `;
  }).join('');

  if (rowsHtml.trim() === '' && !isTableEditing) {
    rowsHtml = NoData.renderTableRow(12, 'No competency data is available for the selected subject or quarter.', 'Click "Edit Worksheet" to add competency rows manually, or choose a different academic context.');
  }

  // INLINE CREATION ROW
  let inlineAddRowHtml = '';
  if (isTableEditing) {
    inlineAddRowHtml = `
      <tr class="bg-emerald-50/40 dark:bg-emerald-900/10 border-t-2 border-dashed border-emerald-300 dark:border-emerald-800">
        <td class="px-3 py-2 text-center">
          <button data-action="commit-inline-new" title="Add this competency row" class="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-xs transition-colors cursor-pointer">+</button>
        </td>
        <td class="px-2 py-2">
          <input type="text" id="inline-new-code" placeholder="e.g. CS_EN11/12A-EAPP-Ia-c-7" class="kit-grid-cell w-full px-2 py-1 text-xs font-mono rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400" />
        </td>
        <td class="px-2 py-2">
          <input type="text" id="inline-new-desc" placeholder="Type competency description..." class="kit-grid-cell w-full px-2 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400" />
        </td>
        <td class="px-2 py-2 text-center">
          <input type="number" id="inline-new-hours" value="4" min="1" class="kit-grid-cell w-14 text-center px-1 py-1 text-xs font-bold rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        </td>
        <td class="px-2 py-2 text-center text-xs text-gray-400">—</td>
        <td class="px-1 py-2 text-center"><input type="number" id="inline-new-rem" value="0" min="0" class="kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 font-semibold text-blue-600" /></td>
        <td class="px-1 py-2 text-center"><input type="number" id="inline-new-und" value="0" min="0" class="kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 font-semibold text-indigo-600" /></td>
        <td class="px-1 py-2 text-center"><input type="number" id="inline-new-app" value="0" min="0" class="kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 font-semibold text-purple-600" /></td>
        <td class="px-1 py-2 text-center"><input type="number" id="inline-new-ana" value="0" min="0" class="kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 font-semibold text-amber-600" /></td>
        <td class="px-1 py-2 text-center"><input type="number" id="inline-new-eva" value="0" min="0" class="kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 font-semibold text-rose-600" /></td>
        <td class="px-1 py-2 text-center"><input type="number" id="inline-new-cre" value="0" min="0" class="kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 font-semibold text-emerald-600" /></td>
        <td class="px-3 py-2 text-center text-xs font-semibold text-emerald-600">+ Add Row</td>
      </tr>
    `;
  }

  // TOTALS FOOTER ROW — only rendered when the worksheet actually has competency
  // rows. An empty TOS must not display a totals table (no data = no table).
  let totalsFooterHtml = '';
  if (competenciesStore.length > 0) {
    const domainTotals = { remembering: 0, understanding: 0, applying: 0, analyzing: 0, evaluating: 0, creating: 0 };
    competenciesStore.forEach(c => {
      domainKeys.forEach(dk => { domainTotals[dk] += c.domains[dk]; });
    });

    const totalAllocatedItems = domainKeys.reduce((sum, dk) => sum + domainTotals[dk], 0);

    const domainTotalCells = domainKeys.map((dk, i) => {
      const val = domainTotals[dk];
      const color = domainColors[i];
      if (val === 0) {
        return `<td class="px-2 py-3 text-center text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-500 border-t-2 border-amber-400" title="${dk}: no items allocated">${val}</td>`;
      }
      return `<td class="px-2 py-3 text-center text-xs font-bold text-${color}-600 border-t-2 border-gray-200 dark:border-gray-700">${val}</td>`;
    }).join('');

    // Hours total cell color-coded highlight
    let hoursTotalCell;
    if (totalHours > targetHours) {
      hoursTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-t-2 border-rose-500 ring-2 ring-rose-400 ring-inset rounded" title="Total hours exceed the ${targetHours} hrs target">${totalHours} hrs</td>`;
    } else if (totalHours === targetHours) {
      hoursTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-t-2 border-emerald-500" title="Total hours match target">${totalHours} hrs</td>`;
    } else {
      hoursTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-t-2 border-amber-400" title="Total hours are below the ${targetHours} hrs target">${totalHours} hrs</td>`;
    }

    let itemsTotalCell;
    if (totalAllocatedItems > targetN) {
      itemsTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-t-2 border-rose-500 ring-2 ring-rose-400 ring-inset rounded">${totalAllocatedItems}</td>`;
    } else if (totalAllocatedItems === targetN) {
      itemsTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-t-2 border-emerald-500">${totalAllocatedItems}</td>`;
    } else {
      itemsTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-t-2 border-amber-400">${totalAllocatedItems}</td>`;
    }

    totalsFooterHtml = `
      <tr id="tos-totals-row" class="bg-gray-100 dark:bg-gray-800/80 font-semibold">
        <td class="px-3 py-3 border-t-2 border-gray-300 dark:border-gray-600"></td>
        <td class="px-4 py-3 text-xs uppercase text-gray-500 border-t-2 border-gray-300 dark:border-gray-600" colspan="2">Column Totals</td>
        ${hoursTotalCell}
        ${itemsTotalCell}
        ${domainTotalCells}
        <td class="px-3 py-3 border-t-2 border-gray-300 dark:border-gray-600"></td>
      </tr>
    `;
  }

  container.innerHTML = rowsHtml + inlineAddRowHtml + totalsFooterHtml;
  updateLiveValidation();
}

// Live Input Handler - Non-destructive targeted DOM updates for live editing
function onDomainInputChanged() {
  if (!isTableEditing) return;

  const domainKeys = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  const domainAbbr = ['rem', 'und', 'app', 'ana', 'eva', 'cre'];
  const domainColors = ['blue', 'indigo', 'purple', 'amber', 'rose', 'emerald'];
  const targetItemsInput = document.getElementById('tos-total-items');
  const targetN = targetItemsInput ? Number(targetItemsInput.value) || 40 : 40;
  const targetHoursInput = document.getElementById('tos-target-hours');
  const targetHours = targetHoursInput ? Number(targetHoursInput.value) || 40 : 40;

  // 1. Synchronize DOM input values into competenciesStore safely
  competenciesStore.forEach(c => {
    const codeEl = document.getElementById(`edit-code-${c.id}`);
    const descEl = document.getElementById(`edit-desc-${c.id}`);
    const hoursEl = document.getElementById(`edit-hours-${c.id}`);

    if (codeEl) c.code = codeEl.value;
    if (descEl) c.description = descEl.value;

    const rawHoursStr = hoursEl ? hoursEl.value : '';
    c.hours = rawHoursStr === '' ? 0 : safeInt(rawHoursStr, 0);

    domainKeys.forEach((dk, i) => {
      const inputEl = document.getElementById(`edit-${domainAbbr[i]}-${c.id}`);
      if (inputEl) {
        const rawDomainStr = inputEl.value;
        c.domains[dk] = rawDomainStr === '' ? 0 : safeInt(rawDomainStr, 0);
      }
    });
  });

  const totalHours = competenciesStore.reduce((acc, c) => acc + c.hours, 0);

  // 2. Perform targeted DOM updates on calculated cells without touching input elements
  competenciesStore.forEach(c => {
    const expectedItems = getExpectedItems(c);
    const rowVal = getRowValidationStatus(c, totalHours, targetHours, expectedItems, competenciesStore.length);
    const { isDomainOver, isHoursZero, isRowHoursExcessive, isHoursOverflow: totalHoursOverflow, isHoursDeficit: totalHoursDeficit, statusBadge, isRowError } = rowVal;

    // Update Items Cell
    const itemsCell = document.getElementById(`items-cell-${c.id}`);
    if (itemsCell) {
      itemsCell.textContent = expectedItems;
      itemsCell.className = `px-2 py-2 text-center font-bold text-xs ${isDomainOver ? 'text-rose-600 font-extrabold' : 'text-brand-500'}`;
    }

    // Update Status Cell
    const statusCell = document.getElementById(`status-cell-${c.id}`);
    if (statusCell) {
      statusCell.innerHTML = statusBadge;
    }

    // Update Hours Input styling
    const hoursInputEl = document.getElementById(`edit-hours-${c.id}`);
    if (hoursInputEl) {
      let hoursClass = `kit-grid-cell w-14 text-center px-1 py-1 text-xs font-bold rounded transition-colors `;
      if (isHoursZero) {
        hoursClass += `border-2 border-rose-500 bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-400/50 font-extrabold`;
      } else {
        hoursClass += `border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white`;
      }
      hoursInputEl.className = hoursClass;
    }

    // Update Row Tr styling
    const rowTrEl = document.getElementById(`row-${c.id}`);
    if (rowTrEl) {
      let trClass = 'border-b border-stroke dark:border-strokedark ';
      if (isDomainOver || isHoursZero) {
        trClass += 'bg-rose-50/40 dark:bg-rose-900/20 border-l-4 border-l-rose-500';
      } else if (isRowError) {
        trClass += 'bg-amber-50/30 dark:bg-amber-900/10 border-l-4 border-l-amber-400';
      } else {
        trClass += 'hover:bg-gray-50 dark:hover:bg-gray-800';
      }
      rowTrEl.className = trClass;
    }

    // Update cell border highlights for domains
    domainKeys.forEach((dk, i) => {
      const val = c.domains[dk];
      const abbr = domainAbbr[i];
      const inputEl = document.getElementById(`edit-${abbr}-${c.id}`);
      if (inputEl) {
        const isCellOver = val > expectedItems || (val > 0 && isDomainOver);
        if (isCellOver) {
          inputEl.className = `kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded transition-colors border-2 border-rose-500 bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-400/50 font-extrabold`;
        } else {
          inputEl.className = `kit-grid-cell w-12 text-center px-1 py-1 text-xs rounded font-semibold transition-colors border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-brand-500`;
        }
      }
    });
  });

  // 3. Update Column Totals Footer Row live
  const totalsRowEl = document.getElementById('tos-totals-row');
  if (totalsRowEl) {
    const domainTotals = { remembering: 0, understanding: 0, applying: 0, analyzing: 0, evaluating: 0, creating: 0 };
    competenciesStore.forEach(c => {
      domainKeys.forEach(dk => { domainTotals[dk] += c.domains[dk]; });
    });
    const totalAllocatedItems = domainKeys.reduce((sum, dk) => sum + domainTotals[dk], 0);

    const domainTotalCells = domainKeys.map((dk, i) => {
      const val = domainTotals[dk];
      const color = domainColors[i];
      if (val === 0) {
        return `<td class="px-2 py-3 text-center text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-500 border-t-2 border-amber-400" title="${dk}: no items allocated">${val}</td>`;
      }
      return `<td class="px-2 py-3 text-center text-xs font-bold text-${color}-600 border-t-2 border-gray-200 dark:border-gray-700">${val}</td>`;
    }).join('');

    let hoursTotalCell;
    if (totalHours > targetHours) {
      hoursTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-t-2 border-rose-500 ring-2 ring-rose-400 ring-inset rounded" title="Total hours exceed the ${targetHours} hrs target">${totalHours} hrs</td>`;
    } else if (totalHours === targetHours) {
      hoursTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-t-2 border-emerald-500" title="Total hours match target">${totalHours} hrs</td>`;
    } else {
      hoursTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-t-2 border-amber-400" title="Total hours are below the ${targetHours} hrs target">${totalHours} hrs</td>`;
    }

    let itemsTotalCell;
    if (totalAllocatedItems > targetN) {
      itemsTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-t-2 border-rose-500 ring-2 ring-rose-400 ring-inset rounded">${totalAllocatedItems}</td>`;
    } else if (totalAllocatedItems === targetN) {
      itemsTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-t-2 border-emerald-500">${totalAllocatedItems}</td>`;
    } else {
      itemsTotalCell = `<td class="px-2 py-3 text-center text-xs font-extrabold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-t-2 border-amber-400">${totalAllocatedItems}</td>`;
    }

    totalsRowEl.innerHTML = `
      <td class="px-3 py-3 border-t-2 border-gray-300 dark:border-gray-600"></td>
      <td class="px-4 py-3 text-xs uppercase text-gray-500 border-t-2 border-gray-300 dark:border-gray-600" colspan="2">Column Totals</td>
      ${hoursTotalCell}
      ${itemsTotalCell}
      ${domainTotalCells}
      <td class="px-3 py-3 border-t-2 border-gray-300 dark:border-gray-600"></td>
    `;
  }

  // 4. Update validation metrics & banner
  updateLiveValidation();
  triggerAutoSave();
}

export function updateLiveValidation() {
  const banner = document.getElementById('tos-validation-banner');
  const targetItemsInput = document.getElementById('tos-total-items');
  const targetHoursInput = document.getElementById('tos-target-hours');

  if (!banner) return;

  const targetN = targetItemsInput ? Number(targetItemsInput.value) || 40 : 40;
  const targetHours = targetHoursInput ? Number(targetHoursInput.value) || 40 : 40;
  const domainKeys = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  const domainAbbr = ['rem', 'und', 'app', 'ana', 'eva', 'cre'];
  const domainTotals = { remembering: 0, understanding: 0, applying: 0, analyzing: 0, evaluating: 0, creating: 0 };

  let currentHoursSum = 0;
  competenciesStore.forEach(c => {
    if (isTableEditing) {
      currentHoursSum += Number(document.getElementById(`edit-hours-${c.id}`)?.value) || c.hours;
      domainKeys.forEach((dk, i) => {
        domainTotals[dk] += Number(document.getElementById(`edit-${domainAbbr[i]}-${c.id}`)?.value) || c.domains[dk];
      });
    } else {
      currentHoursSum += c.hours;
      domainKeys.forEach(dk => { domainTotals[dk] += c.domains[dk]; });
    }
  });

  const totalAllocated = domainKeys.reduce((sum, dk) => sum + domainTotals[dk], 0);

  // Update Summary Card displays
  const sumHoursDisp = document.getElementById('sum-hours-val');
  const sumHoursSub = document.getElementById('sum-hours-sub');
  const sumItemsDisp = document.getElementById('sum-items-val');
  const sumItemsSub = document.getElementById('sum-items-sub');
  const sumErrorsDisp = document.getElementById('sum-errors-val');
  const sumErrorsSub = document.getElementById('sum-errors-sub');

  if (sumHoursDisp) {
    sumHoursDisp.textContent = `${currentHoursSum} / ${targetHours} hrs`;
    sumHoursDisp.classList.remove('text-rose-600', 'text-amber-600', 'text-emerald-600', 'text-gray-900', 'dark:text-white');
  }
  
  let hoursStatus = 'valid';
  if (currentHoursSum === targetHours) {
    if (sumHoursSub) {
      sumHoursSub.textContent = 'Verified';
      sumHoursSub.className = 'text-[9px] text-emerald-600 font-medium';
    }
    if (sumHoursDisp) sumHoursDisp.classList.add('text-emerald-600');
  } else if (currentHoursSum < targetHours) {
    hoursStatus = 'deficit';
    const remainingHours = targetHours - currentHoursSum;
    if (sumHoursSub) {
      sumHoursSub.textContent = `${remainingHours} remaining`;
      sumHoursSub.className = 'text-[9px] text-amber-600 font-medium';
    }
    if (sumHoursDisp) sumHoursDisp.classList.add('text-amber-600');
  } else {
    hoursStatus = 'overflow';
    const excessHours = currentHoursSum - targetHours;
    if (sumHoursSub) {
      sumHoursSub.textContent = `+${excessHours} excess`;
      sumHoursSub.className = 'text-[9px] text-rose-600 font-medium';
    }
    if (sumHoursDisp) sumHoursDisp.classList.add('text-rose-600');
  }

  if (sumItemsDisp) {
    sumItemsDisp.textContent = `${totalAllocated} / ${targetN}`;
    sumItemsDisp.classList.remove('text-rose-600', 'text-amber-600', 'text-emerald-600');
  }

  // Count validation mismatches at row level (including hours errors and domain errors)
  let rowErrors = 0;
  competenciesStore.forEach(c => {
    const expected = getExpectedItems(c);
    const rowVal = getRowValidationStatus(c, currentHoursSum, targetHours, expected, competenciesStore.length);
    if (rowVal.isRowError) rowErrors++;
  });

  if (sumErrorsDisp) {
    sumErrorsDisp.textContent = `${rowErrors}`;
    sumErrorsDisp.classList.remove('text-emerald-600', 'text-rose-600');
    if (rowErrors > 0) {
      sumErrorsDisp.classList.add('text-rose-600');
    } else {
      sumErrorsDisp.classList.add('text-emerald-600');
    }
  }
  if (sumErrorsSub) {
    sumErrorsSub.textContent = rowErrors > 0 ? `${rowErrors} row issue(s)` : 'No issues';
    sumErrorsSub.className = rowErrors > 0 ? 'text-[9px] text-rose-600 font-medium' : 'text-[9px] text-emerald-600 font-medium';
  }

  // Determine Items Allocation state
  let itemsStatus = 'valid';
  if (totalAllocated === targetN) {
    if (sumItemsSub) {
      sumItemsSub.textContent = 'Verified';
      sumItemsSub.className = 'text-[9px] text-emerald-600 font-medium';
    }
    if (sumItemsDisp) sumItemsDisp.classList.add('text-emerald-600');
  } else if (totalAllocated < targetN) {
    itemsStatus = 'deficit';
    const deficit = targetN - totalAllocated;
    if (sumItemsSub) {
      sumItemsSub.textContent = `${deficit} remaining`;
      sumItemsSub.className = 'text-[9px] text-amber-600 font-medium';
    }
    if (sumItemsDisp) sumItemsDisp.classList.add('text-amber-600');
  } else {
    itemsStatus = 'overflow';
    const overflow = totalAllocated - targetN;
    if (sumItemsSub) {
      sumItemsSub.textContent = `+${overflow} overflow`;
      sumItemsSub.className = 'text-[9px] text-rose-600 font-medium';
    }
    if (sumItemsDisp) sumItemsDisp.classList.add('text-rose-600');
  }

  // Compute total validation error count for the status banner
  const totalErrorsCount = rowErrors + (hoursStatus !== 'valid' ? 1 : 0) + (itemsStatus !== 'valid' ? 1 : 0);

  // Format combined validation messages inside the status banner
  let bannerClass = '';
  let bannerHtml = '';

  const issuesList = [];
  if (hoursStatus === 'overflow') {
    issuesList.push(`Hours: ${currentHoursSum}/${targetHours} (+${currentHoursSum - targetHours} excess)`);
  } else if (hoursStatus === 'deficit') {
    issuesList.push(`Hours: ${currentHoursSum}/${targetHours} (${targetHours - currentHoursSum} remaining)`);
  }

  if (itemsStatus === 'overflow') {
    issuesList.push(`Items: ${totalAllocated}/${targetN} (+${totalAllocated - targetN} overflow)`);
  } else if (itemsStatus === 'deficit') {
    issuesList.push(`Items: ${totalAllocated}/${targetN} (${targetN - totalAllocated} remaining)`);
  }

  if (rowErrors > 0) {
    issuesList.push(`${rowErrors} row errors`);
  }

  if (totalErrorsCount === 0) {
    bannerClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    bannerHtml = `✓ Validation Passed: Hours & Items Verified (${currentHoursSum} hrs · ${totalAllocated} items)`;
  } else {
    bannerClass = 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
    bannerHtml = `❌ Validation Alert: ${issuesList.join('  ·  ')}`;
  }

  banner.className = `text-xs font-semibold px-3 py-1.5 rounded-full ${bannerClass} flex items-center gap-1.5`;
  banner.innerHTML = bannerHtml;
}

export function renderOfficialDepEdPreview() {
  const tbody = document.getElementById('preview-tbody');
  if (!tbody) return;

  const subjectVal = document.getElementById('info-subject')?.value || '';
  const gradeVal = document.getElementById('info-grade-level')?.value || '';
  const qtrVal = document.getElementById('info-quarter')?.value || '';
  const strandVal = document.getElementById('info-strand')?.value || '';
  const secVal = document.getElementById('info-section')?.value || '';
  const syVal = document.getElementById('info-school-year')?.value || '';
  const teacherVal = document.getElementById('info-teacher')?.value || '';
  const targetN = document.getElementById('tos-total-items')?.value || '';

  // Update preview header labels — null-guarded so this works in both
  // the standalone tos.html and the embedded workspace TOS panel.
  const setPreview = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setPreview('preview-subject', subjectVal || '—');
  setPreview('preview-grade',   gradeVal   || '—');
  setPreview('preview-qtr',     qtrVal     || '—');
  setPreview('preview-strand',  strandVal  || '—');
  setPreview('preview-section', secVal     || '—');
  setPreview('preview-sy',      syVal      || '—');
  setPreview('preview-teacher', teacherVal || '—');
  setPreview('sig-teacher',     (teacherVal || '—').toUpperCase());
  setPreview('preview-items',   targetN ? `${targetN} Test Items` : '—');

  const targetHoursInput = document.getElementById('tos-target-hours');
  const targetHours = targetHoursInput ? Number(targetHoursInput.value) || 40 : 40;

  if (!competenciesStore || competenciesStore.length === 0) {
    tbody.innerHTML = `
      <tr class="border-b border-gray-900 text-center">
        <td colspan="10" class="border border-gray-900 p-6 text-sm text-gray-500">No competency data is available for the selected academic context. Click "Edit Worksheet" to add competency rows manually, or choose a different subject/quarter.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = competenciesStore.map(c => {
    const items = getExpectedItems(c);
    return `
      <tr class="border-b border-gray-900 text-center">
        <td class="border border-gray-900 p-1.5 font-mono text-[11px] font-bold text-left">${escapeHTML(c.code)}</td>
        <td class="border border-gray-900 p-1.5 text-left">${escapeHTML(c.description)}</td>
        <td class="border border-gray-900 p-1.5 font-semibold">${c.hours}</td>
        <td class="border border-gray-900 p-1.5 font-bold">${items}</td>
        <td class="border border-gray-900 p-1.5">${c.domains.remembering || '-'}</td>
        <td class="border border-gray-900 p-1.5">${c.domains.understanding || '-'}</td>
        <td class="border border-gray-900 p-1.5">${c.domains.applying || '-'}</td>
        <td class="border border-gray-900 p-1.5">${c.domains.analyzing || '-'}</td>
        <td class="border border-gray-900 p-1.5">${c.domains.evaluating || '-'}</td>
        <td class="border border-gray-900 p-1.5">${c.domains.creating || '-'}</td>
      </tr>
    `;
  }).join('');
}

function updateBulkActionBar() {;
  const bulkBar = document.getElementById('tos-bulk-bar');
  const countElem = document.getElementById('tos-selected-count');

  if (!bulkBar) return;

  if (selectedRowIds.size > 0) {;
    if (countElem) countElem.textContent = `${selectedRowIds.size} competency row(s) selected`;
    bulkBar.classList.remove('hidden');
  } else {
    bulkBar.classList.add('hidden');
  }
}

/**
 * The following functions are now local to this module and are invoked by the
 * delegated event listeners in `addTOSGridEventListeners`. They no longer
 * pollute the global `window` object.
 */
function toggleTOSRowSelect(id, isChecked) {
  if (isChecked) {
    selectedRowIds.add(id);
  } else {
    selectedRowIds.delete(id);
  }
  updateBulkActionBar();
}

function commitInlineNewRow() {
  const codeEl = document.getElementById('inline-new-code');
  const descEl = document.getElementById('inline-new-desc');
  const code = codeEl?.value?.trim() || `CS_EN11/12A-EAPP-${Date.now().toString().slice(-4)}`;
  const desc = descEl?.value?.trim();

  if (!desc) {
    showToast('Please type a competency description before adding.');
    if (descEl) descEl.focus();
    return;
  }

  const hours = Number(document.getElementById('inline-new-hours')?.value) || 4;
  const rem = Number(document.getElementById('inline-new-rem')?.value) || 0;
  const und = Number(document.getElementById('inline-new-und')?.value) || 0;
  const app = Number(document.getElementById('inline-new-app')?.value) || 0;
  const ana = Number(document.getElementById('inline-new-ana')?.value) || 0;
  const eva = Number(document.getElementById('inline-new-eva')?.value) || 0;
  const cre = Number(document.getElementById('inline-new-cre')?.value) || 0;

  const newComp = {
    id: `comp-${Date.now()}`,
    code,
    description: desc,
    hours,
    domains: { remembering: rem, understanding: und, applying: app, analyzing: ana, evaluating: eva, creating: cre }
  };

  competenciesStore.push(newComp);
  renderTOSGrid();
  triggerAutoSave();
  showToast(`Added "${desc.substring(0, 40)}..." to TOS worksheet`);

  requestAnimationFrame(() => {
    const newDescField = document.getElementById('inline-new-desc');
    if (newDescField) newDescField.focus();
  });
}

function bulkDuplicateRows() {
  const selectedList = Array.from(selectedRowIds);
  selectedList.forEach(id => {
    const target = competenciesStore.find(c => c.id === id);
    if (target) {
      const copy = {
        ...JSON.parse(JSON.stringify(target)),
        id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        code: `${target.code}-COPY`
      };
      competenciesStore.push(copy);
    }
  });

  selectedRowIds.clear();
  updateBulkActionBar();
  renderTOSGrid();
  triggerAutoSave();
  showToast(`Duplicated ${selectedList.length} competency row(s)`);
}

function confirmBulkDeleteRows() {
  competenciesStore = competenciesStore.filter(c => !pendingDeleteIds.includes(c.id));
  const count = pendingDeleteIds.length;
  pendingDeleteIds = [];
  selectedRowIds.clear();
  updateBulkActionBar();
  renderTOSGrid();
  document.getElementById('delete-tos-confirm-modal')?.classList.add('hidden');
  triggerAutoSave();
  showToast(`Deleted ${count} competency row(s)`);
}

function showToast(message) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  toast.innerHTML = `<span>${message}</span>`;
  toast.classList.remove('hidden', 'translate-y-10', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}
