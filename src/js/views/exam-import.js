// OCR Scanner & Manual Entry Controller
import { SkeletonBuilder } from '../skeletons.js';
import { ResponseStore } from '../stores/response-store.js';
import { ConfigStore } from '../stores/config-store.js';
import { escapeHTML } from '../utils.js';
import Tesseract from 'tesseract.js';
import { ImportStore } from '../stores/import-store.js';
import { getAnswerKeys, upsertAnswerKey, deleteAnswerKey, gradeAnswers } from '../api/answer-key-api.js';

// Currently selected target section for imports/saves
let selectedSection = '';
let selectedSubjectId = '';
let selectedSubjectTitle = '';
let currentImage = null;

// Answer key state for the currently viewed subject + term
let currentKey = null; // parsed key { id, subjectId, term, title, answers, expiresAt }
let keyAutosaveTimer = null;

export function initExamImportView() {
  console.log('[Project KIT] Initializing OCR Scanner & Manual Response View');

  // Render section selector UI
  renderSectionSelector();

  const tabs = document.querySelectorAll('#import-mode-tabs .mode-btn');
  const container = document.getElementById('ingestion-tab-content');

  if (tabs.length && container) {
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;

        tabs.forEach((t) => {
          t.classList.remove('border-brand-500', 'text-brand-500', 'font-semibold');
          t.classList.add('border-transparent', 'text-gray-500', 'font-medium');
        });

        e.currentTarget.classList.remove('border-transparent', 'text-gray-500', 'font-medium');
        e.currentTarget.classList.add('border-brand-500', 'text-brand-500', 'font-semibold');

        // Instant Skeleton Injection (Zero Screen Overlay)
        container.innerHTML = SkeletonBuilder.renderFormSkeleton();

        setTimeout(() => {
          if (mode === 'ocr') {
            renderOcrView(container);
          } else {
            renderManualEntryForm(container);
          }
        }, 300);
      });
    });
  }

  attachOcrListeners();
}

function renderSectionSelector() {
  let container = document.getElementById('section-selector-container');

  // If the container is not present, attempt to create it just above the ingestion content
  if (!container) {
    const parent = document.getElementById('ingestion-tab-content');
    if (!parent) return;
    container = document.createElement('div');
    container.id = 'section-selector-container';
    container.className = 'mb-4';
    parent.parentNode.insertBefore(container, parent);
  }

  const config = ConfigStore.getSafe();
  const sections = (config && Array.isArray(config.sections)) ? config.sections : [];
  const subjects = (config && Array.isArray(config.subjects)) ? config.subjects : [];

  if (!sections.length) {
    container.innerHTML = '<p class="text-sm text-gray-500">No sections configured.</p>';
    selectedSection = '';
    return;
  }

  // Build the subject + section selects
  const row = document.createElement('div');
  row.className = 'flex flex-wrap gap-4 items-center';

  const subjectLabel = document.createElement('label');
  subjectLabel.className = 'text-sm font-medium text-gray-700 mr-2';
  subjectLabel.textContent = 'Subject:';

  const subjectSelect = document.createElement('select');
  subjectSelect.id = 'exam-import-subject-select';
  subjectSelect.className = 'px-3 py-2 rounded border border-gray-300 text-sm';
  if (subjects.length === 0) {
    subjectSelect.innerHTML = '<option value="">— No subjects configured —</option>';
  } else {
    subjectSelect.innerHTML = subjects.map(s => `<option value="${escapeHTML(s.id || '')}">${escapeHTML(s.title)}</option>`).join('');
  }

  const subjectWrap = document.createElement('div');
  subjectWrap.className = 'flex items-center';
  subjectWrap.appendChild(subjectLabel);
  subjectWrap.appendChild(subjectSelect);

  const sectionLabel = document.createElement('label');
  sectionLabel.className = 'text-sm font-medium text-gray-700 mr-2';
  sectionLabel.textContent = 'Target Section:';

  const select = document.createElement('select');
  select.id = 'exam-import-section-select';
  select.className = 'px-3 py-2 rounded border border-gray-300 text-sm';
  select.innerHTML = sections.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}${s.strand ? ' (' + escapeHTML(s.strand) + ')' : ''}</option>`).join('');

  const sectionWrap = document.createElement('div');
  sectionWrap.className = 'flex items-center';
  sectionWrap.appendChild(sectionLabel);
  sectionWrap.appendChild(select);

  row.appendChild(subjectWrap);
  row.appendChild(sectionWrap);

  container.innerHTML = '';
  container.appendChild(row);

  // Default selection to first subject / section
  selectedSubjectId = subjectSelect.value || subjects[0]?.id || '';
  selectedSubjectTitle = subjects.find(s => s.id === selectedSubjectId)?.title || subjectSelect.options[subjectSelect.selectedIndex]?.text || '';
  selectedSection = select.value || sections[0].name;

  subjectSelect.addEventListener('change', (e) => {
    selectedSubjectId = e.target.value;
    selectedSubjectTitle = subjectSelect.options[subjectSelect.selectedIndex]?.text || '';
    loadAnswerKeyForContext();
  });

  select.addEventListener('change', (e) => {
    selectedSection = e.target.value;
  });
}

function renderOcrView(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="p-4 rounded-xl border border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-900/15 text-xs text-gray-600 dark:text-gray-300 space-y-1">
        <p class="font-semibold text-brand-700 dark:text-brand-300">Expected gradebook layout</p>
        <p>Each row should show: <strong>LRN</strong> (12-digit learner reference number), <strong>Learner Name</strong>, then the <strong>item scores</strong> separated by spaces or columns (e.g. <code class="px-1 py-0.5 rounded bg-white dark:bg-gray-800">123456789012  JUAN DELA CRUZ  1 0 1 1 0</code>).</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="p-8 bg-white dark:bg-gray-dark rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-brand-500 transition text-center cursor-pointer" id="ocr-dropzone">
          <input type="file" id="ocr-file-input" accept="image/*" capture="environment" class="hidden" />
          <div class="flex flex-col items-center justify-center">
            <div class="p-4 bg-brand-50 dark:bg-brand-900/20 text-brand-500 rounded-full mb-3">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white">Scan or upload a printed gradebook photo</h3>
            <p class="text-xs text-gray-500 mt-1">Take a clear photo of the student rows with the camera, or choose an image</p>
            <button type="button" id="ocr-capture-btn" class="mt-4 px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-sm transition">Open Camera</button>
          </div>
        </div>

        <div class="p-4 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            Image Preview
          </h3>
          <div class="rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center min-h-48">
            <p class="text-xs text-gray-400 p-4" id="ocr-preview-empty">No image selected yet.</p>
            <img id="ocr-preview-img" alt="Gradebook preview" class="hidden max-h-72 object-contain rounded-lg" />
          </div>
          <button type="button" id="btn-run-ocr" disabled class="w-full px-4 py-2.5 text-xs font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0a6 6 0 01-6-6m6 6a6 6 0 006-6m-6 0V4M4 16h2m10-6a6 6 0 00-6-6m6 6a6 6 0 01-6 6"></path></svg>
            Scan Text from Image
          </button>
          <div id="ocr-progress" class="hidden">
            <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div id="ocr-progress-bar" class="h-full bg-indigo-500 transition-all" style="width:0%"></div>
            </div>
            <p id="ocr-progress-text" class="text-[11px] text-gray-400 mt-1"></p>
          </div>
        </div>
      </div>

      <div id="ocr-results" class="hidden">
        <div class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white">
              <span id="ocr-result-count">0</span> student rows detected — review before importing
            </h3>
            <button type="button" id="btn-import-ocr" class="px-4 py-2 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 shadow-sm transition">
              Import into Selected Section
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left border-b border-gray-200 dark:border-gray-700">
                  <th class="py-2 pr-2 font-semibold text-gray-500 dark:text-gray-400">LRN</th>
                  <th class="py-2 pr-2 font-semibold text-gray-500 dark:text-gray-400">Learner Name</th>
                  <th class="py-2 pr-2 font-semibold text-gray-500 dark:text-gray-400">Items</th>
                  <th class="py-2 font-semibold text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody id="ocr-results-body"></tbody>
            </table>
          </div>
          <p class="text-[11px] text-gray-400">Edit any misread value before importing. Rows missing a valid LRN are skipped.</p>
          <div id="ocr-import-status"></div>
        </div>
      </div>
    </div>
  `;
  attachOcrListeners();
}

function renderManualEntryForm(container) {
  container.innerHTML = `
    <div class="p-6 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-6">
      <h3 class="text-base font-bold text-gray-900 dark:text-white">Direct Examinee Response & Score Input</h3>

      <div id="answer-key-panel"></div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-400 mb-1">Learner Reference Number (LRN)</label>
          <input type="text" id="manual-lrn" placeholder="109823450001" class="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-400 mb-1">Student Full Name</label>
          <input type="text" id="manual-name" placeholder="Last Name, First Name M.I." class="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        </div>

      </div>

      <div>
        <label class="block text-xs font-semibold uppercase text-gray-400 mb-1">Item Response Vector</label>
        <textarea id="manual-vector" rows="3" placeholder="1,1,0,1,1,0,0,1,1,1,1,0,1,1,1,0,1,1,0,1" class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"></textarea>
        <p class="text-[11px] text-gray-400 mt-1">Binary scores: <code class="font-mono">1,0,1,1</code>. When an answer key is active below, you can instead type the student's raw answers as letters: <code class="font-mono">A,C,B,D,A</code> — the system grades them against the key and saves the final score.</p>
      </div>

      <div class="flex justify-end gap-3">
        <button type="button" class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200">Reset Form</button>
        <button type="button" id="btn-save-manual-examinee" class="px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-sm">Save Examinee Response</button>
      </div>
    </div>
  `;

  renderAnswerKeyPanel(container);

  document.getElementById('btn-save-manual-examinee')?.addEventListener('click', handleManualSave);
}

function getCurrentTerm() {
  const cfg = ConfigStore.getSafe();
  return ResponseStore.normalizeTermName(cfg?.academicPeriod?.term || cfg?.academicPeriod?.quarter || 'First Quarter');
}

async function handleManualSave() {
  const lrn = document.getElementById('manual-lrn')?.value?.trim() || `LRN-${Date.now()}`;
  const name = document.getElementById('manual-name')?.value?.trim() || 'New Student';
  const vectorRaw = document.getElementById('manual-vector')?.value?.trim();

  if (!vectorRaw) {
    alert('Please enter student answers (1 for correct, 0 for incorrect).');
    return;
  }

  if (!selectedSection) {
    alert('Please select a section first.');
    return;
  }

  const currentTerm = getCurrentTerm();
  const existing = ResponseStore.getForSection(selectedSection, currentTerm);
  const tokens = vectorRaw.split(',').map(t => t.trim());

  // Letter mode: an active answer key grades the student's raw letters and
  // persists the computed final score onto the student's test record.
  const letters = tokens.map(t => t.toUpperCase());
  const isLetterMode = currentKey && letters.length > 0 && letters.every(t => /^[A-D]$/.test(t));

  if (isLetterMode) {
    if (!selectedSubjectId) {
      alert('Please select a subject first.');
      return;
    }
    try {
      const response = await gradeAnswers({
        subjectId: selectedSubjectId,
        term: currentTerm,
        sectionName: selectedSection,
        students: [{ lrn, name, answers: letters }],
      });
      const graded = response?.data?.results?.[0];
      if (graded) {
        const vector = new Array(Math.max(1, graded.totalItems || letters.length)).fill(0);
        // responses vector already persisted server-side; rebuild locally from graded result
        const gradedRow = existing.find(s => s.lrn === lrn);
        const updatedRow = {
          ...(gradedRow || { lrn, name }),
          lrn,
          name,
          subjectId: selectedSubjectId,
          responses: vector.map((_, i) => (letters[i] === currentKey?.answers?.find(a => a.itemNumber === i + 1)?.correct ? 1 : 0)),
          score: graded.score,
          totalItems: graded.totalItems,
          percentage: graded.percentage,
          status: 'GRADED',
        };
        existing.push(updatedRow);
        await ResponseStore.saveSectionResponses(selectedSection, existing, currentTerm);
        logImport(currentTerm, 'Graded', graded.percentage, existing.length);
        alert(`Graded ${name}: ${graded.score}/${graded.totalItems} (${graded.percentage}%). Final score saved.`);
        return;
      }
      alert('Grading completed but no per-student result was returned.');
    } catch (error) {
      console.warn('[ExamImport] Grading failed', error);
      alert('Grading failed: no active answer key for this subject and term (keys are valid for 1 week).');
    }
    return;
  }

  const responses = tokens.map(v => Number(v) || 0);
  existing.push({ lrn, name, responses });
  await ResponseStore.saveSectionResponses(selectedSection, existing, currentTerm);

  // Log manual save to import log for visibility in Recent Imports
  try {
    const metrics = ResponseStore.getSectionMetrics(selectedSection, currentTerm);
    logImport(currentTerm, 'Saved', metrics?.averageMps, existing.length);
  } catch (e) {
    // ignore
  }

  alert(`Saved answers for ${name}. Item analysis updated.`);
}

function logImport(currentTerm, status, mps, studentCount) {
  ImportStore.add({
    id: `manual-${Date.now()}`,
    date: new Date().toISOString().replace('T',' ').slice(0,16),
    fileName: status === 'Graded' ? 'Manual Entry (auto-graded)' : 'Manual Entry',
    section: selectedSection,
    subject: selectedSubjectTitle,
    status,
    mps: mps != null ? `${mps}%` : null,
    studentCount,
    quarter: currentTerm
  });
}

/* ─────────────────────────── ANSWER KEY & GRADING ─────────────────────────── */

async function renderAnswerKeyPanel(container) {
  const panel = document.getElementById('answer-key-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Answer Key & Grading</p>
          <p id="answer-key-status" class="text-xs text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
        <button type="button" id="btn-delete-answer-key" class="hidden px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 rounded-lg hover:bg-rose-100">Delete Key</button>
      </div>
      <div id="answer-key-grid" class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-8 gap-2"></div>
      <p class="text-[11px] text-gray-400">This key is valid for 1 week from save, then deleted automatically. Graded final scores stay saved on the students forever.</p>
    </div>
  `;

  document.getElementById('btn-delete-answer-key')?.addEventListener('click', async () => {
    if (!currentKey) return;
    if (!window.confirm('Delete this answer key? Graded scores already saved to students will NOT be removed.')) return;
    try {
      await deleteAnswerKey(currentKey.id);
      currentKey = null;
      await loadAnswerKeyForContext();
    } catch (error) {
      console.warn('[ExamImport] Failed to delete answer key', error);
      alert('Failed to delete the answer key.');
    }
  });

  await loadAnswerKeyForContext();
}

async function loadAnswerKeyForContext() {
  const statusEl = document.getElementById('answer-key-status');
  if (!statusEl) return;

  try {
    const response = await getAnswerKeys();
    const keys = response?.success && Array.isArray(response.data) ? response.data : [];
    const term = getCurrentTerm();
    currentKey = keys.find(k => k.subjectId === selectedSubjectId && k.term === term) || null;
  } catch (error) {
    console.warn('[ExamImport] Failed to load answer keys', error);
    currentKey = null;
  }

  if (!selectedSubjectId) {
    statusEl.textContent = 'Select a subject to manage its answer key.';
  } else if (!currentKey) {
    statusEl.textContent = `No active key for ${selectedSubjectTitle || 'this subject'} (${getCurrentTerm()}). Set correct answers below to enable letter grading.`;
  } else {
    statusEl.textContent = `Active · expires in ${formatExpiryDays(currentKey.expiresAt)}`;
  }

  document.getElementById('btn-delete-answer-key')?.classList.toggle('hidden', !currentKey);
  buildKeyGrid();
}

function buildKeyGrid() {
  const grid = document.getElementById('answer-key-grid');
  if (!grid) return;

  const cfg = ConfigStore.getSafe();
  const subject = cfg?.subjects?.find(s => s.id === selectedSubjectId);
  const keyMax = currentKey && currentKey.answers.length > 0 ? Math.max(...currentKey.answers.map(a => a.itemNumber)) : 0;
  const itemCount = Math.max(Number(subject?.targetItems) || 0, keyMax, 0) || 40;

  const answersMap = new Map((currentKey?.answers || []).map(a => [a.itemNumber, a.correct]));
  grid.innerHTML = '';
  for (let i = 1; i <= itemCount; i += 1) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1';
    row.innerHTML = `
      <span class="text-[10px] text-gray-400 w-4 text-right">${i}</span>
      <select data-key-item="${i}" class="px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
        <option value="">—</option>
        ${['A','B','C','D'].map(l => `<option value="${l}">${l}</option>`).join('')}
      </select>
    `;
    row.querySelector('select').value = answersMap.get(i) || '';
    grid.appendChild(row);
  }

  grid.addEventListener('change', onKeyGridChange);
}

function onKeyGridChange() {
  const grid = document.getElementById('answer-key-grid');
  if (!grid || !selectedSubjectId) return;

  const answers = [];
  grid.querySelectorAll('select[data-key-item]').forEach(sel => {
    const correct = sel.value;
    if (correct) answers.push({ itemNumber: Number(sel.dataset.keyItem), correct });
  });
  triggerKeyAutoSave(answers);
}

function triggerKeyAutoSave(answers) {
  const statusEl = document.getElementById('answer-key-status');
  if (statusEl) statusEl.textContent = 'Saving key…';

  clearTimeout(keyAutosaveTimer);
  keyAutosaveTimer = setTimeout(async () => {
    try {
      const response = await upsertAnswerKey({
        subjectId: selectedSubjectId,
        term: getCurrentTerm(),
        title: selectedSubjectTitle || null,
        answers,
      });
      if (response?.success && response.data) {
        currentKey = response.data;
        const status = document.getElementById('answer-key-status');
        if (status) status.textContent = `Active · expires in ${formatExpiryDays(currentKey.expiresAt)}`;
        document.getElementById('btn-delete-answer-key')?.classList.remove('hidden');
      }
    } catch (error) {
      console.warn('[ExamImport] Answer key save failed', error);
      const status = document.getElementById('answer-key-status');
      if (status) status.textContent = '✗ Key save failed';
    }
  }, 800);
}

function formatExpiryDays(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(ms / 86400000));
  return days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
}

/* ─────────────────────────── OCR SCANNER ─────────────────────────── */

function attachOcrListeners() {
  const dropzone = document.getElementById('ocr-dropzone');
  const fileInput = document.getElementById('ocr-file-input');
  const captureBtn = document.getElementById('ocr-capture-btn');

  document.getElementById('btn-run-ocr')?.addEventListener('click', runOcr);

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
  }
  captureBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) loadOcrImage(file);
  });
}

function loadOcrImage(file) {
  currentImage = null;
  const imgEl = document.getElementById('ocr-preview-img');
  const emptyEl = document.getElementById('ocr-preview-empty');
  const runBtn = document.getElementById('btn-run-ocr');

  const reader = new FileReader();
  reader.onload = () => {
    currentImage = reader.result;
    if (imgEl) {
      imgEl.src = currentImage;
      imgEl.classList.remove('hidden');
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (runBtn) runBtn.disabled = false;
  };
  reader.onerror = () => {
    alert('Could not read the selected image.');
  };
  reader.readAsDataURL(file);
}

function normalizeOcrToken(token) {
  // Fix common OCR confusions: O -> 0, l/I/| -> 1, S -> 5
  const t = String(token).trim();
  if (/^[oO]{1,2}$/.test(t)) return '0';
  if (/^[lI|]{1,2}$/.test(t)) return '1';
  if (/^s$/.test(t)) return '5';
  return t.replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
}

function isScoreToken(token) {
  const n = Number(token);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

function parseOcrLine(line) {
  const tokens = String(line || '').trim().split(/[\s|]+/).filter(Boolean);
  if (tokens.length < 2) return null;

  // Header / non-data rows
  if (/lrn|learner|name|item|score|section|strand|grade|subject|page|average|total/i.test(tokens.join(' '))) {
    return null;
  }

  // First token must be the LRN (>= 4 consecutive digits)
  const first = tokens[0].replace(/[^0-9]/g, '');
  if (first.length < 4) return null;

  // Trailing run of score tokens are the item scores; everything between is the name.
  // Score tokens tolerate common OCR confusions (O -> 0, l/I -> 1), names do not.
  let scoreStart = tokens.length;
  for (let i = tokens.length - 1; i >= 1; i -= 1) {
    if (isScoreToken(normalizeOcrToken(tokens[i]))) {
      scoreStart = i;
    } else {
      break;
    }
  }

  const name = tokens.slice(1, scoreStart).join(' ').trim();
  const responses = tokens.slice(scoreStart).map(t => Number(normalizeOcrToken(t)) || 0);

  if (!name || responses.length === 0) return null;
  return { lrn: first, name, responses };
}

export function parseOcrText(text) {
  return String(text || '')
    .split('\n')
    .map(parseOcrLine)
    .filter(Boolean);
}

async function runOcr() {
  const runBtn = document.getElementById('btn-run-ocr');
  const progressWrap = document.getElementById('ocr-progress');
  const progressBar = document.getElementById('ocr-progress-bar');
  const progressText = document.getElementById('ocr-progress-text');

  if (!currentImage) return;

  runBtn.disabled = true;
  progressWrap?.classList.remove('hidden');
  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = 'Loading OCR engine...';

  try {
    const result = await Tesseract.recognize(currentImage, 'eng', {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
      langPath: 'vendor/tesseract/',
      gzip: true,
      logger: (m) => {
        if (!progressBar || !progressText) return;
        const pct = Math.round((m.progress || 0) * 100);
        if (m.status === 'recognizing text') {
          progressBar.style.width = `${Math.min(pct, 95)}%`;
          progressText.textContent = `Reading text... ${pct}%`;
        } else {
          progressText.textContent = m.status;
        }
      },
    });

    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = 'Done.';

    const rows = parseOcrText(result.data.text);
    renderOcrPreview(rows);
  } catch (error) {
    console.error('OCR failed:', error);
    if (progressText) progressText.textContent = 'OCR failed — please try a clearer photo.';
  } finally {
    runBtn.disabled = false;
  }
}

function renderOcrPreview(rows) {
  const resultsEl = document.getElementById('ocr-results');
  const countEl = document.getElementById('ocr-result-count');
  const body = document.getElementById('ocr-results-body');

  if (!resultsEl || !body) return;

  const maxItems = Math.max(0, ...rows.map(r => r.responses.length));
  if (rows.length > 0) {
    resultsEl.classList.remove('hidden');
  }
  if (countEl) countEl.textContent = String(rows.length);

  body.innerHTML = rows.map((row, index) => `
    <tr class="border-b border-gray-100 dark:border-gray-800">
      <td class="py-2 pr-2">
        <input type="text" data-field="lrn" data-index="${index}" value="${escapeHTML(row.lrn)}" class="w-36 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:outline-none focus:border-brand-500" />
      </td>
      <td class="py-2 pr-2">
        <input type="text" data-field="name" data-index="${index}" value="${escapeHTML(row.name)}" class="w-56 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-brand-500" />
      </td>
      <td class="py-2 pr-2">
        <input type="text" data-field="items" data-index="${index}" value="${row.responses.join(' ')}" class="w-56 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:outline-none focus:border-brand-500" />
      </td>
      <td class="py-2">
        <button type="button" data-action="remove-row" data-index="${index}" class="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition" title="Remove row">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-action="remove-row"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      const remaining = rows.filter((_, i) => i !== index);
      renderOcrPreview(remaining);
    });
  });

  document.getElementById('btn-import-ocr')?.addEventListener('click', () => importOcrRows());
}

function collectOcrRows() {
  const body = document.getElementById('ocr-results-body');
  if (!body) return [];
  const rows = [];
  body.querySelectorAll('tr').forEach((tr) => {
    const lrn = tr.querySelector('[data-field="lrn"]')?.value?.trim() || '';
    const name = tr.querySelector('[data-field="name"]')?.value?.trim() || '';
    const itemsRaw = tr.querySelector('[data-field="items"]')?.value?.trim() || '';
    const responses = itemsRaw.split(/[\s,]+/).map(t => Number(t) || 0);
    if (lrn.length >= 4) rows.push({ lrn, name, responses });
  });
  return rows;
}

function importOcrRows() {
  const statusEl = document.getElementById('ocr-import-status');
  const rows = collectOcrRows();

  if (!selectedSection) {
    if (statusEl) {
      statusEl.innerHTML = '<p class="text-sm text-rose-600">Please select a target section first.</p>';
    }
    return;
  }
  if (rows.length === 0) {
    if (statusEl) {
      statusEl.innerHTML = '<p class="text-sm text-rose-600">No valid student rows to import. Check the LRN column.</p>';
    }
    return;
  }

  const currentQuarter = ConfigStore.getSafe().academicPeriod?.quarter || 'First Quarter';
  const existing = ResponseStore.getForSection(selectedSection, currentQuarter);
  const merged = [...existing];
  rows.forEach((row) => {
    const existingIndex = merged.findIndex(s => String(s.lrn) === String(row.lrn));
    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], ...row };
    } else {
      merged.push(row);
    }
  });
  ResponseStore.saveSectionResponses(selectedSection, merged, currentQuarter);

  try {
    const metrics = ResponseStore.getSectionMetrics(selectedSection, currentQuarter);
    ImportStore.add({
      id: `ocr-${Date.now()}`,
      date: new Date().toISOString().replace('T',' ').slice(0,16),
      fileName: 'OCR Scan',
      section: selectedSection,
      subject: selectedSubjectTitle,
      status: 'Processed',
      mps: metrics?.averageMps != null ? `${metrics.averageMps}%` : null,
      studentCount: metrics?.totalStudents ?? rows.length,
      quarter: currentQuarter
    });
  } catch (e) {
    // ignore logging failures
  }

  if (statusEl) {
    statusEl.innerHTML = `<p class="text-sm text-emerald-600 font-medium">✓ Imported <strong>${rows.length}</strong> scanned student record(s) into <strong>${escapeHTML(selectedSection)}</strong>.</p>`;
  }
}
