/**
 * setup-tos.js
 *
 * Embeds the full TOS editor inside the Assessment Workspace TOS tab.
 *
 * Architecture: ONE implementation (tos.js). This file is a thin host that:
 *   1. Injects the same HTML structure that tos.html uses
 *   2. Locks the subject/grade/section/term/SY context to the assessment
 *   3. Seeds the shared tos.js module state via setTOSContext()
 *   4. Calls the shared rendering, event, and save functions from tos.js
 *
 * The standalone tos.html continues to work unchanged.
 */

import {
  setTOSContext,
  setIsTableEditing,
  loadCompetencies,
  getCompetenciesForContext,
  addTOSGridEventListeners,
  renderTOSGrid,
  updateLiveValidation,
  triggerAutoSave,
  switchViewMode,
  renderOfficialDepEdPreview,
  buildDocumentPayload,
  commitTableEdits,
} from '../../views/tos.js';
import { upsertTosDocument } from '../../api/tos-api.js';
import { escapeHTML } from '../../utils.js';
import { printElement } from '../print-engine.js';

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * @param {object|null} tosDocument  – existing TOS from the assessment (null if none yet)
 * @param {HTMLElement}  containerEl – the #tos-panel DOM element
 * @param {object}       assessment  – the full assessment object
 */
export async function renderSetupTos(tosDocument, containerEl, assessment) {
  if (!containerEl) return;

  // Derive context entirely from the assessment — teacher cannot change these
  const subject    = assessment?.subject?.title || assessment?.subjectId || '';
  const grade      = assessment?.section?.grade  || '';
  const section    = assessment?.section?.name   || '';
  const term       = assessment?.term            || '';
  const schoolYear = assessment?.schoolYear      || '';
  const targetItems = assessment?.targetItems    || 50;
  const assessmentId = assessment?.id            || null;

  // Existing rows and status (empty array if no TOS yet)
  let rows  = [];
  let state = 'Draft';
  let targetHours = 40;
  if (tosDocument) {
    try {
      rows = typeof tosDocument.rows === 'string'
        ? JSON.parse(tosDocument.rows)
        : (tosDocument.rows || []);
    } catch { rows = []; }
    state = tosDocument.status || 'Draft';
    targetHours = tosDocument.targetHours || 40;
  }

  // ── 1. Inject the full TOS HTML structure ──────────────────────────────────
  containerEl.innerHTML = buildTOSPanelHTML({
    subject, grade, section, term, schoolYear,
    targetItems, targetHours, state,
  });

  // ── 2. Seed tos.js shared state ────────────────────────────────────────────
  setTOSContext({
    rows,
    state,
    assessmentIdOverride: assessmentId,
  });

  // ── 3. If no rows yet, try loading from competency bank ───────────────────
  if (!rows.length) {
    try {
      await loadCompetencies();
      const bankRows = getCompetenciesForContext(subject, term, schoolYear, grade, '', section);
      if (bankRows.length) {
        setTOSContext({ rows: bankRows, state, assessmentIdOverride: assessmentId });
      }
    } catch (e) {
      console.warn('[WorkspaceTOS] Competency bank load failed', e);
    }
  }

  // ── 4. Wire the shared TOS engine ─────────────────────────────────────────
  addTOSGridEventListeners();
  renderTOSGrid();
  updateLiveValidation();

  // ── 5. Wire controls ──────────────────────────────────────────────────────
  wireControls(containerEl, assessmentId, subject, term, schoolYear, targetItems);
}

// ─── Wire buttons / controls ─────────────────────────────────────────────────

function wireControls(containerEl, assessmentId, subject, term, schoolYear, targetItems) {
  // Edit / Save toggle — mirrors tos.html behaviour
  const btnEdit   = document.getElementById('btn-edit-tos-toggle');
  const btnCancel = document.getElementById('btn-cancel-tos-edit');

  btnEdit?.addEventListener('click', () => {
    const isEditing = btnEdit.dataset.editing === '1';
    if (!isEditing) {
      // Enter edit mode
      btnEdit.dataset.editing = '1';
      btnEdit.textContent = 'Save Changes';
      btnEdit.className = 'px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs transition flex items-center gap-1.5';
      btnCancel?.classList.remove('hidden');
      // Re-render in edit mode — relies on tos.js isTableEditing being toggled
      // We call commitTableEdits → off, then manually set via re-render trick:
      // Simplest: use the same handleEditToggleClick pathway. Since it's not exported,
      // we call renderTOSGrid() after flipping mode via the data attribute approach.
      document.getElementById('tos-competency-tbody')?.querySelectorAll('[data-tos-readonly]')
        .forEach(el => el.removeAttribute('data-tos-readonly'));
      // Trigger tos.js's own edit flow via a direct renderTOSGrid call
      // (tos.js checks isTableEditing internally — we need it exported or workaround)
      // Workaround: click the hidden original toggle that tos.js already binds
      // — but since we replaced the DOM the original listener is gone.
      // Instead: expose isTableEditing setter — done below via a new export in tos.js
      setEditMode(true);
    } else {
      // Commit edits and save
      btnEdit.dataset.editing = '0';
      btnEdit.textContent = 'Edit Worksheet';
      btnEdit.className = 'px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-xs transition flex items-center gap-1.5';
      btnCancel?.classList.add('hidden');
      setEditMode(false);
      commitTableEdits();
      saveWorkspaceTOS(assessmentId, subject, term, schoolYear, targetItems);
    }
  });

  btnCancel?.addEventListener('click', () => {
    btnEdit.dataset.editing = '0';
    btnEdit.textContent = 'Edit Worksheet';
    btnEdit.className = 'px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-xs transition flex items-center gap-1.5';
    btnCancel.classList.add('hidden');
    setEditMode(false);
    renderTOSGrid();
  });

  // View mode switcher
  document.getElementById('btn-view-worksheet')?.addEventListener('click', () => {
    switchViewMode('worksheet');
    document.getElementById('btn-view-worksheet')?.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-xs');
    document.getElementById('btn-view-preview')?.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-xs');
  });

  document.getElementById('btn-view-preview')?.addEventListener('click', () => {
    // Commit any in-progress edits before preview
    commitTableEdits();
    switchViewMode('preview');
    renderOfficialDepEdPreview();
    document.getElementById('btn-view-preview')?.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-xs');
    document.getElementById('btn-view-worksheet')?.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-xs');
  });

  // Allocation mode radios
  containerEl.querySelectorAll('input[name="alloc-mode"]').forEach(radio => {
    radio.addEventListener('change', () => triggerAutoSave());
  });

  // Target hours / items changes trigger autosave + revalidation
  ['tos-target-hours', 'tos-total-items'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      updateLiveValidation();
      triggerAutoSave();
    });
  });

  // Delete confirm modal — mirrors tos.html inline handler
  document.getElementById('btn-confirm-delete-tos-rows')?.addEventListener('click', () => {
    document.getElementById('delete-tos-confirm-modal')?.classList.add('hidden');
  });

  // TOS print — isolated iframe print of just the DepEd TOS card
  document.getElementById('btn-print-tos')?.addEventListener('click', () => {
    printElement('official-tos-card', { title: 'Table of Specifications' });
  });
}

// ─── Edit mode toggle helper ─────────────────────────────────────────────────

function setEditMode(on) {
  setIsTableEditing(on);
  renderTOSGrid();
  updateLiveValidation();
}

// ─── Workspace TOS autosave ──────────────────────────────────────────────────

async function saveWorkspaceTOS(assessmentId, subject, term, schoolYear, targetItems) {
  const dot  = document.getElementById('autosave-dot');
  const text = document.getElementById('autosave-text');
  const time = document.getElementById('autosave-time');

  if (dot)  dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
  if (text) text.textContent = 'Saving…';

  try {
    const payload = buildDocumentPayload();
    const result  = await upsertTosDocument(payload);
    if (result?.success) {
      if (dot)  dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
      if (text) text.textContent = '✓ Saved';
      const now = new Date();
      if (time) time.textContent = `· ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      throw new Error('Unexpected response');
    }
  } catch (err) {
    if (dot)  dot.className = 'w-2 h-2 rounded-full bg-red-500';
    if (text) text.textContent = '⚠ Unable to save';
    console.warn('[WorkspaceTOS] Save failed', err);
  }
}

// ─── HTML builder ────────────────────────────────────────────────────────────

function buildTOSPanelHTML({ subject, grade, section, term, schoolYear, targetItems, targetHours, state }) {
  const statusCls = state?.toLowerCase() === 'finalized' || state?.toLowerCase() === 'approved'
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';

  return /* html */`

    <!-- ── Hidden context inputs (read by buildDocumentPayload in tos.js) ─── -->
    <input type="hidden" id="info-subject"     value="${escapeHTML(subject)}">
    <input type="hidden" id="info-term"        value="${escapeHTML(term)}">
    <input type="hidden" id="info-school-year" value="${escapeHTML(schoolYear)}">
    <input type="hidden" id="info-grade-level" value="${escapeHTML(grade)}">
    <input type="hidden" id="info-strand"      value="">
    <input type="hidden" id="info-section"     value="${escapeHTML(section)}">
    <input type="hidden" id="info-teacher"     value="">

    <!-- ── Header ────────────────────────────────────────────────────────── -->
    <div class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">

      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <!-- Left: title + locked context -->
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white">Table of Specifications</h3>
            <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${statusCls}">
              ${escapeHTML(state || 'Draft')}
            </span>
          </div>
          <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
            <p class="font-semibold text-gray-700 dark:text-gray-200">${escapeHTML(subject)}</p>
            <p>
              ${grade ? `${escapeHTML(grade)} · ` : ''}${escapeHTML(section)}
              ${term ? ` · ${escapeHTML(term)}` : ''}
              ${schoolYear ? ` · SY ${escapeHTML(schoolYear)}` : ''}
            </p>
          </div>
        </div>

        <!-- Right: controls -->
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <!-- Autosave indicator -->
          <div id="autosave-indicator" class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium mr-2">
            <span id="autosave-dot" class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span id="autosave-text">✓ Saved</span>
            <span id="autosave-time" class="text-gray-400 dark:text-gray-500"></span>
          </div>
          <!-- View mode switcher -->
          <div class="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex items-center gap-1 text-xs">
            <button id="btn-view-worksheet"
              class="px-3 py-1.5 rounded-lg font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs transition">
              Worksheet
            </button>
            <button id="btn-view-preview"
              class="px-3 py-1.5 rounded-lg font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
              Preview / Print
            </button>
          </div>
          <!-- Edit / Save -->
          <button id="btn-edit-tos-toggle" data-editing="0"
            class="px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-xs transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            Edit Worksheet
          </button>
          <button id="btn-cancel-tos-edit"
            class="hidden px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 transition">
            Cancel
          </button>
        </div>
      </div>

      <!-- Editable: Target Hours + Target Items + Allocation Mode -->
      <div class="flex flex-wrap gap-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
        <div class="flex items-center gap-2">
          <label class="font-semibold text-gray-600 dark:text-gray-400">Target Hours:</label>
          <input type="number" id="tos-target-hours" value="${targetHours}" min="1" max="120"
            class="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-center text-brand-600 dark:text-brand-400 focus:ring-2 focus:ring-brand-500"/>
        </div>
        <div class="flex items-center gap-2">
          <label class="font-semibold text-gray-600 dark:text-gray-400">Target Items:</label>
          <input type="number" id="tos-total-items" value="${targetItems}" min="1" max="200"
            class="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-center text-brand-600 dark:text-brand-400 focus:ring-2 focus:ring-brand-500"/>
        </div>
        <div class="flex items-center gap-2">
          <label class="font-semibold text-gray-600 dark:text-gray-400">Item Allocation:</label>
          <label class="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="alloc-mode" value="manual" checked class="text-brand-500 focus:ring-brand-500"/>
            <span class="text-gray-700 dark:text-gray-300">Manual</span>
          </label>
          <label class="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="alloc-mode" value="hamilton" class="text-brand-500 focus:ring-brand-500"/>
            <span class="text-gray-700 dark:text-gray-300">Hamilton Auto</span>
          </label>
        </div>
      </div>

      <!-- Metrics summary -->
      <div class="grid grid-cols-3 gap-3 text-center text-xs pt-2 border-t border-gray-100 dark:border-gray-800">
        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60">
          <span class="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Hours</span>
          <span id="sum-hours-val" class="block text-sm font-extrabold text-gray-900 dark:text-white">0 hrs</span>
          <span id="sum-hours-sub" class="text-[9px] text-gray-500 font-medium">0 remaining</span>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60">
          <span class="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Allocated</span>
          <span id="sum-items-val" class="block text-sm font-extrabold text-brand-600 dark:text-brand-400">0 / ${targetItems}</span>
          <span id="sum-items-sub" class="text-[9px] text-emerald-600 font-bold">Verified</span>
        </div>
        <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60">
          <span class="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Errors</span>
          <span id="sum-errors-val" class="block text-sm font-extrabold text-emerald-600">0</span>
          <span id="sum-errors-sub" class="text-[9px] text-gray-400">0 warnings</span>
        </div>
      </div>
    </div>

    <!-- ── WORKSHEET VIEW ─────────────────────────────────────────────────── -->
    <div id="worksheet-view-container" class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
      <div class="flex items-center justify-between mb-2">
        <div>
          <h4 class="text-sm font-bold text-gray-900 dark:text-white">Competency Item Allocation Matrix</h4>
          <p class="text-xs text-gray-500 dark:text-gray-400">Distribute test items across Bloom's Taxonomy cognitive process dimensions</p>
        </div>
        <div id="tos-validation-banner"></div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
              <th class="px-3 py-3 w-10 text-center">
                <input type="checkbox" id="select-all-tos-rows" class="rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500"/>
              </th>
              <th class="px-3 py-3 w-44 font-bold text-gray-700 dark:text-gray-300">Code</th>
              <th class="px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Learning Competency Description</th>
              <th class="px-3 py-3 text-center w-16 font-bold text-gray-700 dark:text-gray-300">Hours</th>
              <th class="px-3 py-3 text-center w-16 font-bold text-brand-500">Items</th>
              <th class="px-2.5 py-3 text-center w-16 text-blue-600 dark:text-blue-400 font-bold">
                <span class="inline-block px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-[10px]" title="Remembering">REM</span>
              </th>
              <th class="px-2.5 py-3 text-center w-16 text-indigo-600 dark:text-indigo-400 font-bold">
                <span class="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-[10px]" title="Understanding">UND</span>
              </th>
              <th class="px-2.5 py-3 text-center w-16 text-purple-600 dark:text-purple-400 font-bold">
                <span class="inline-block px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-[10px]" title="Applying">APP</span>
              </th>
              <th class="px-2.5 py-3 text-center w-16 text-amber-600 dark:text-amber-400 font-bold">
                <span class="inline-block px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-[10px]" title="Analyzing">ANA</span>
              </th>
              <th class="px-2.5 py-3 text-center w-16 text-rose-600 dark:text-rose-400 font-bold">
                <span class="inline-block px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/30 text-[10px]" title="Evaluating">EVA</span>
              </th>
              <th class="px-2.5 py-3 text-center w-16 text-emerald-600 dark:text-emerald-400 font-bold">
                <span class="inline-block px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[10px]" title="Creating">CRE</span>
              </th>
              <th class="px-3 py-3 text-center w-24 font-bold text-gray-700 dark:text-gray-300">Validation</th>
            </tr>
          </thead>
          <tbody id="tos-competency-tbody">
            <!-- Populated by renderTOSGrid() from tos.js -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── PRINT PREVIEW VIEW (hidden by default) ─────────────────────────── -->
    <div id="print-preview-container" class="hidden space-y-4">
      <div id="official-tos-card" class="p-8 bg-white text-gray-900 rounded-xl border border-gray-200 shadow-md font-serif max-w-4xl mx-auto space-y-6">
        <div class="text-center space-y-1 border-b-2 border-gray-900 pb-4">
          <p class="text-xs font-bold uppercase tracking-widest text-gray-600">Republic of the Philippines</p>
          <p class="text-sm font-bold uppercase tracking-widest text-gray-800">Department of Education</p>
          <h2 class="text-base font-extrabold uppercase text-gray-900 tracking-wider pt-1">TABLE OF SPECIFICATIONS (TOS)</h2>
        </div>
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p><strong>SUBJECT:</strong> <span id="preview-subject">${escapeHTML(subject)}</span></p>
            <p><strong>GRADE LEVEL:</strong> <span id="preview-grade">${escapeHTML(grade)}</span> · <span id="preview-qtr">${escapeHTML(term)}</span></p>
            <p><strong>SECTION:</strong> <span id="preview-section">${escapeHTML(section)}</span></p>
          </div>
          <div class="text-right">
            <p><strong>SCHOOL YEAR:</strong> <span id="preview-sy">${escapeHTML(schoolYear)}</span></p>
            <p><strong>TOTAL ITEMS:</strong> <span id="preview-items">${targetItems} Test Items</span></p>
            <p><strong>INSTRUCTOR:</strong> <span id="preview-teacher">—</span></p>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left border-collapse border border-gray-900">
            <thead>
              <tr class="bg-gray-100 text-gray-900 border-b border-gray-900 text-center font-bold">
                <th class="border border-gray-900 p-2">CODE</th>
                <th class="border border-gray-900 p-2 text-left">LEARNING COMPETENCY</th>
                <th class="border border-gray-900 p-2 w-12">HOURS</th>
                <th class="border border-gray-900 p-2 w-12">ITEMS</th>
                <th class="border border-gray-900 p-2 w-10">REM</th>
                <th class="border border-gray-900 p-2 w-10">UND</th>
                <th class="border border-gray-900 p-2 w-10">APP</th>
                <th class="border border-gray-900 p-2 w-10">ANA</th>
                <th class="border border-gray-900 p-2 w-10">EVA</th>
                <th class="border border-gray-900 p-2 w-10">CRE</th>
              </tr>
            </thead>
            <tbody id="preview-tbody">
              <!-- Populated by renderOfficialDepEdPreview() -->
            </tbody>
          </table>
        </div>
        <div class="grid grid-cols-3 gap-6 pt-8 text-xs text-center border-t border-gray-300">
          <div>
            <p class="text-gray-500">Prepared by:</p>
            <p class="font-bold text-gray-900 underline mt-8" id="sig-teacher">—</p>
            <p class="text-[10px] text-gray-500">Subject Teacher / Proponent</p>
          </div>
          <div>
            <p class="text-gray-500">Reviewed by:</p>
            <p class="font-bold text-gray-900 underline mt-8">DEPARTMENT HEAD</p>
            <p class="text-[10px] text-gray-500">Academic Coordinator</p>
          </div>
          <div>
            <p class="text-gray-500">Approved by:</p>
            <p class="font-bold text-gray-900 underline mt-8">SCHOOL PRINCIPAL</p>
            <p class="text-[10px] text-gray-500">School Head / Administrator</p>
          </div>
        </div>
        <div class="text-center pt-4 no-print">
          <button id="btn-print-tos"
            class="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg shadow-sm">
            🖨 Print Official TOS Document
          </button>
        </div>
      </div>
    </div>

    <!-- ── Bulk action bar ────────────────────────────────────────────────── -->
    <div id="tos-bulk-bar"
      class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-gray-900/95 dark:bg-gray-dark/95 backdrop-blur-md text-white text-xs px-6 py-3 rounded-xl shadow-2xl flex items-center gap-6 border border-gray-800">
      <span id="tos-selected-count" class="font-medium">0 rows selected</span>
      <div class="h-4 w-px bg-gray-700/60"></div>
      <div class="flex items-center gap-3">
        <button id="btn-tos-bulk-duplicate"
          class="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-semibold shadow-sm flex items-center gap-2 transition-colors">
          Duplicate Selected
        </button>
        <button id="btn-tos-bulk-delete"
          class="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 rounded-lg font-semibold shadow-sm flex items-center gap-2 transition-colors">
          Delete Selected
        </button>
      </div>
    </div>

    <!-- ── Delete confirm modal ───────────────────────────────────────────── -->
    <div id="delete-tos-confirm-modal"
      class="hidden fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
      <div class="w-full max-w-md bg-white dark:bg-gray-dark rounded-xl p-6 shadow-2xl space-y-4">
        <h3 class="text-base font-bold text-gray-900 dark:text-white">Delete Selected Competencies?</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Are you sure you want to delete the selected competency row(s)? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-3 pt-2">
          <button onclick="document.getElementById('delete-tos-confirm-modal')?.classList.add('hidden')"
            class="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          <button id="btn-confirm-delete-tos-rows"
            class="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm">
            Delete Competencies
          </button>
        </div>
      </div>
    </div>

    <!-- ── doc-status-tag (read by tos.js updateDocumentStatusUI) ─────────── -->
    <span id="doc-status-tag" class="hidden">${escapeHTML(state || 'Draft')}</span>
  `;
}
