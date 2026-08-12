// Assessment Workspace View Controller — Phase 3
// Route: /assessment-workspace.html?id=:assessmentId
//
// Responsibilities:
//  • Read ?id= from URL — single source of truth for workspace context
//  • Redirect to /assessments.html if ID is missing or non-numeric
//  • Load assessment via AssessmentStore
//  • Render workspace header, stepper, and stage sub-components
//  • Orchestrate TOS, Answer Key, Attendance, Results rendering
//  • Handle Status transitions with Optimistic Concurrency (v<version>), Reopen, Score Overrides
//  • Paginate attendance and responses

import { AssessmentStore } from '../stores/assessment-store.js';
import { escapeHTML } from '../utils.js';
import * as AssessmentApi from '../api/assessment-api.js';
import * as IntelligenceApi from '../api/intelligence-api.js';

// Modular Components
import { renderWorkspaceHeader } from '../components/assessment/workspace-header.js';
import { renderSetupTos } from '../components/assessment/setup-tos.js';
import { renderSetupAnswerKey } from '../components/assessment/setup-answer-key.js';
import { renderExamAttendance } from '../components/assessment/exam-attendance.js';

// ─── UTILITY HELPERS (DECLARED BEFORE INITIALIZATION) ────────────────────────
function el(id) { return document.getElementById(id); }
function setText(id, text) { const e = el(id); if (e) e.textContent = text; }

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'info') {
  const t = document.createElement('div');
  t.className = `fixed bottom-6 right-6 z-99999 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white transition-all duration-300 ${
    type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800'
  }`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ─── State ───────────────────────────────────────────────────────────────────
let attendancePage = 1;
let responsePageNum = 1;
const PAGE_SIZE = 50;
let attendanceTotalPages = 1;
let responsesTotalPages = 1;
let unsubscribe = null;

// ─── PUBLIC INIT ─────────────────────────────────────────────────────────────
export async function initAssessmentWorkspaceView() {
  console.log('[Workspace] Initializing assessment workspace view');

  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  attendancePage = 1;
  responsePageNum = 1;

  // Resolve assessment ID from URL
  const id = AssessmentStore.getAssessmentIdFromUrl();
  if (!id) {
    console.warn('[Workspace] Invalid or missing assessment ID in URL. Redirecting to Hub.');
    if (window.__pjaxNavigate) {
      window.__pjaxNavigate(new URL('/assessments.html', window.location.origin));
    } else {
      window.location.href = 'assessments.html';
    }
    return;
  }

  // Subscribe to store changes and render accordingly
  unsubscribe = AssessmentStore.subscribe(({ assessment, isLoading, error }) => {
    if (isLoading) { showLoadingState(); return; }
    if (error || !assessment) { showErrorState(error?.status, error?.message); return; }
    renderWorkspace(assessment);
  });

  // Attach persistent UI event listeners
  attachEventListeners();

  // Load assessment (triggers subscription notification)
  await AssessmentStore.load(id);
}

// ─── UI STATE HELPERS ─────────────────────────────────────────────────────────
function showLoadingState() {
  el('workspace-loading')?.classList.remove('hidden');
  el('workspace-error')?.classList.add('hidden');
  el('workspace-shell')?.classList.add('hidden');
}

function showErrorState(status, message) {
  el('workspace-loading')?.classList.add('hidden');
  el('workspace-shell')?.classList.add('hidden');
  el('workspace-error')?.classList.remove('hidden');
  const title = el('workspace-error-title');
  const msg = el('workspace-error-msg');
  if (title) title.textContent = status === 404 ? 'Assessment Not Found' : status === 403 ? 'Access Denied' : 'Load Failed';
  if (msg) msg.textContent = message || 'An unexpected error occurred.';
}

// ─── FULL RENDER ─────────────────────────────────────────────────────────────
function renderWorkspace(assessment) {
  el('workspace-loading')?.classList.add('hidden');
  el('workspace-error')?.classList.add('hidden');
  el('workspace-shell')?.classList.remove('hidden');

  // Modular Header Component
  renderWorkspaceHeader(assessment, AssessmentStore.getStage());

  // Active stage content
  renderActiveStage(assessment);

  // Broadcast assessment context to the AI modal so it can show the right
  // context badge and pre-seed the assessment ID without a round trip.
  window.dispatchEvent(new CustomEvent('deped_assessment_context_update', {
    detail: {
      assessmentId: assessment.id,
      title: assessment.title || `Assessment #${assessment.id}`,
      subject: assessment.subject?.title || '',
      section: assessment.section?.name || '',
      term: assessment.term || '',
      status: assessment.status,
    },
  }));
}


// ─── STAGE RENDER ─────────────────────────────────────────────────────────────
function renderActiveStage(assessment) {
  const stage = AssessmentStore.getStage();

  ['setup', 'exam-day', 'results', 'intelligence'].forEach(s => {
    el(`stage-${s}`)?.classList.toggle('hidden', s !== stage);
  });

  if (stage === 'setup') renderSetupStage(assessment);
  else if (stage === 'exam-day') renderExamDayStage();
  else if (stage === 'results') renderResultsStage();
  else if (stage === 'intelligence') renderIntelligenceStage();
}

// ─── SETUP STAGE ─────────────────────────────────────────────────────────────
function renderSetupStage(a) {
  renderSubTab(AssessmentStore.getSubTab());

  // Details
  setText('detail-subject', a.subject?.title || a.subjectId || '—');
  setText('detail-section', a.section?.name || a.sectionId || '—');
  setText('detail-term', a.term || '—');
  setText('detail-sy', a.schoolYear || '—');
  setText('detail-target-items', a.targetItems ?? '—');
  setText('detail-passing-mps', `${a.passingMps ?? 0}%`);
  setText('detail-version', `v${a.version ?? 1}`);
  setText('detail-created-at', formatDate(a.createdAt));

  // Modular TOS Component — pass full assessment for deep-link context
  renderSetupTos(a.tosDocument, el('tos-panel'), a);


  // Modular Answer Key Component
  renderSetupAnswerKey(a.answerKey, a.answerKeyVersions || [], el('answer-key-panel'), a);

  // Workflow checklist indicators
  const tosGuide = el('guide-tos');
  if (tosGuide) tosGuide.querySelector('span')?.classList.toggle('bg-current', !!a.tosDocument);
  const akGuide = el('guide-ak');
  if (akGuide) akGuide.querySelector('span')?.classList.toggle('bg-current', !!a.answerKey);
}

function renderSubTab(subTab) {
  document.querySelectorAll('.ws-subtab-btn').forEach(btn => {
    const isActive = btn.dataset.subtab === subTab;
    btn.classList.toggle('border-brand-500', isActive);
    btn.classList.toggle('text-brand-600', isActive);
    btn.classList.toggle('dark:text-brand-400', isActive);
    btn.classList.toggle('border-transparent', !isActive);
    btn.classList.toggle('text-gray-500', !isActive);
    btn.classList.toggle('dark:text-gray-400', !isActive);
  });
  document.querySelectorAll('.ws-subtab-content').forEach(content => {
    content.classList.add('hidden');
  });
  el(`subtab-${subTab}`)?.classList.remove('hidden');
}

// ─── EXAM DAY STAGE ───────────────────────────────────────────────────────────
async function renderExamDayStage() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  setText('attendance-summary', 'Loading roster…');
  el('attendance-tbody').innerHTML = `<tr><td colspan="5" class="text-center py-10 text-xs text-gray-400">Loading…</td></tr>`;

  try {
    const res = await AssessmentApi.getAttendance(assessment.id, attendancePage, PAGE_SIZE);
    const data = res?.data;
    const records = Array.isArray(data?.records) ? data.records : (Array.isArray(data) ? data : []);
    attendanceTotalPages = data?.totalPages || 1;

    // Modular Attendance Component
    renderExamAttendance(records, data, el('attendance-tbody'), el('attendance-summary'), attendancePage, PAGE_SIZE, attendanceTotalPages);

    // Attach status select color listeners
    el('attendance-tbody').querySelectorAll('.attendance-status-select').forEach(select => {
      select.addEventListener('change', () => updateSelectColor(select));
    });

    // Attendance pagination
    const pag = el('attendance-pagination');
    if (pag) {
      pag.classList.toggle('hidden', attendanceTotalPages <= 1);
      setText('attendance-page-info', `Page ${attendancePage} of ${attendanceTotalPages}`);
      const prev = el('btn-attendance-prev');
      const next = el('btn-attendance-next');
      if (prev) prev.disabled = attendancePage <= 1;
      if (next) next.disabled = attendancePage >= attendanceTotalPages;
    }

    // Auto-generate fresh idempotency key for scanner
    if (el('scan-idempotency-key')) {
      el('scan-idempotency-key').value = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    // Load & Render Verification Queue
    await loadVerificationQueue(assessment.id);
  } catch (err) {
    console.error('[Workspace] Failed to load attendance', err);
    el('attendance-tbody').innerHTML = `<tr><td colspan="5" class="text-center py-10 text-xs text-red-400">Failed to load attendance roster.</td></tr>`;
  }
}

let loadedVerificationItems = [];
async function loadVerificationQueue(assessmentId) {
  try {
    const res = await AssessmentApi.getVerificationQueue(assessmentId, 1, 50);
    const data = res?.data || res;
    loadedVerificationItems = Array.isArray(data?.records) ? data.records : (Array.isArray(data) ? data : []);
    const totalCount = data?.total ?? loadedVerificationItems.length;
    const tbody = el('verification-tbody');
    const badge = el('verification-count-badge');
    if (badge) setText('verification-count-badge', `${totalCount} pending`);

    if (!tbody) return;
    if (!loadedVerificationItems.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-xs text-gray-400">No pending verification items.</td></tr>`;
      return;
    }

    tbody.innerHTML = loadedVerificationItems.map((item, idx) => {
      const studentName = item.student?.name || 'Unassigned Student';
      const hashShort = item.scanResult?.imageHash ? item.scanResult.imageHash.substring(0, 12) + '…' : '—';
      const confPct = ((item.confidence || 0) * 100).toFixed(0) + '%';
      return `
        <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors">
          <td class="px-4 py-2.5 text-gray-400 font-medium text-[11px]">${idx + 1}</td>
          <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-white text-xs">${escapeHTML(studentName)}</td>
          <td class="px-4 py-2.5 font-mono text-[10px] text-gray-500">${hashShort}</td>
          <td class="px-4 py-2.5"><span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">${escapeHTML(item.reason)}</span></td>
          <td class="px-4 py-2.5 text-center font-bold text-gray-700 dark:text-gray-300">${confPct}</td>
          <td class="px-4 py-2.5 text-center">
            <button data-item-id="${item.id}" class="btn-review-verify-item px-3 py-1 text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition shadow-xs">Inspect &amp; Review</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-review-verify-item').forEach(btn => {
      btn.addEventListener('click', () => openVerificationModal(parseInt(btn.dataset.itemId)));
    });
  } catch (err) {
    console.error('[Workspace] Failed to load verification queue', err);
  }
}

// ─── RESULTS STAGE ───────────────────────────────────────────────────────────
// ─── RESULTS STAGE ────────────────────────────────────────────────────────────
let activeResultsTab = 'summary';

async function renderResultsStage() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  try {
    const summaryData = await AssessmentApi.getResultsSummary(assessment.id);
    const stats = summaryData.classStats;
    const quality = summaryData.qualitySummary;

    setText('results-kpi-avg', `${stats.meanPercentage}%`);
    setText('results-kpi-median', `${stats.medianPercentage}%`);
    setText('results-kpi-passed', `${stats.passingRate}% (${stats.passingCount}/${stats.totalStudents})`);
    setText('results-kpi-minmax', `${stats.maxScore} / ${stats.minScore}`);
    setText('results-kpi-stddev', stats.stdDev);

    const badge = el('results-kpi-quality-badge');
    if (badge) {
      badge.textContent = quality.overallQuality;
      badge.className = `px-2 py-0.5 text-[10px] font-bold uppercase rounded-full inline-block mt-1 ${
        quality.overallQuality === 'EXCELLENT'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : quality.overallQuality === 'GOOD'
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      }`;
    }

    // Render Histogram Chart
    const histoContainer = el('results-score-histogram');
    if (histoContainer && Array.isArray(stats.scoreDistribution)) {
      const maxCount = Math.max(1, ...stats.scoreDistribution.map(d => d.count));
      histoContainer.innerHTML = stats.scoreDistribution.map(b => {
        const heightPct = Math.round((b.count / maxCount) * 100);
        return `
          <div class="flex-1 flex flex-col items-center gap-1 group">
            <span class="text-[9px] font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition">${b.count}</span>
            <div class="w-full bg-brand-500/80 group-hover:bg-brand-500 rounded-t transition-all" style="height: ${Math.max(4, heightPct)}%;"></div>
            <span class="text-[8px] font-semibold text-gray-400 transform -rotate-45 origin-top-left mt-1">${b.range}</span>
          </div>
        `;
      }).join('');
    }

    // Render Active Sub-tab
    if (activeResultsTab === 'students') await renderResultsStudents();
    else if (activeResultsTab === 'items') await renderResultsItems();
    else if (activeResultsTab === 'competencies') await renderResultsCompetencies();
  } catch (err) {
    console.error('[Workspace] Results stage load failed', err);
    showToast(err?.message || 'Failed to load assessment results engine data', 'error');
  }
}

async function renderResultsStudents() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const searchQuery = el('filter-results-student-search')?.value || '';
  try {
    const res = await AssessmentApi.getStudentResults(assessment.id, responsePageNum, PAGE_SIZE, searchQuery);
    const data = res?.data || res;
    const records = data.records || [];
    responsesTotalPages = data.totalPages || 1;

    const tbody = el('responses-tbody');
    const empty = el('responses-empty');

    if (!records.length) {
      tbody.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    tbody.innerHTML = records.map((r) => {
      const pass = r.status === 'PASSED';
      return `
        <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
          <td class="px-4 py-2.5 text-center font-bold text-gray-400 text-xs">#${r.rank}</td>
          <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-white text-xs">${escapeHTML(r.studentName)}</td>
          <td class="px-4 py-2.5 font-mono text-gray-400 text-xs">${escapeHTML(r.studentLrn)}</td>
          <td class="px-4 py-2.5 text-center font-extrabold text-gray-900 dark:text-white">${r.score} / ${r.totalItems}</td>
          <td class="px-4 py-2.5 text-center font-bold ${pass ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${r.percentage}%</td>
          <td class="px-4 py-2.5 text-center font-semibold text-indigo-600 dark:text-indigo-400">${r.percentile}th</td>
          <td class="px-4 py-2.5 text-center">
            ${pass
              ? '<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Passed</span>'
              : '<span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Below MPS</span>'}
          </td>
          <td class="px-4 py-2.5 text-center">
            <button class="btn-override px-2 py-1 text-[10px] font-semibold text-gray-500 hover:text-brand-600 transition" data-response-id="${r.studentId}" data-student-name="${escapeHTML(r.studentName)}" data-current-score="${r.score}">
              Override
            </button>
          </td>
        </tr>`;
    }).join('');

    const pag = el('responses-pagination');
    if (pag) {
      pag.classList.toggle('hidden', responsesTotalPages <= 1);
      setText('responses-page-info', `Page ${responsePageNum} of ${responsesTotalPages}`);
      const prev = el('btn-responses-prev');
      const next = el('btn-responses-next');
      if (prev) prev.disabled = responsePageNum <= 1;
      if (next) next.disabled = responsePageNum >= responsesTotalPages;
    }
  } catch (err) {
    console.error('[Workspace] Student results load failed', err);
  }
}

async function renderResultsItems() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  try {
    const items = await AssessmentApi.getItemAnalysis(assessment.id);
    const tbody = el('item-analysis-tbody');
    if (!tbody) return;

    if (!items || !items.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center py-12 text-xs text-gray-400">
        <div class="flex flex-col items-center gap-2">
          <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <p class="font-semibold text-gray-500">No item analysis available yet</p>
          <p class="text-gray-400">Submit exam responses to generate item analysis data.</p>
        </div>
      </td></tr>`;
      return;
    }

    // Helper — choice cell: big colored pill + count + percentage
    const choiceCell = (distractor, correctKey) => {
      if (!distractor) return '<td class="px-2 py-3 text-center text-gray-300">—</td>';
      const isCorrect = distractor.isCorrect || (correctKey && distractor.choice === correctKey.toUpperCase());
      const hasVotes  = distractor.count > 0;

      // Colour scheme
      const pillCls = isCorrect
        ? 'bg-emerald-500 text-white ring-2 ring-emerald-400 ring-offset-1'
        : hasVotes
          ? 'bg-red-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500';

      const countCls = isCorrect ? 'text-emerald-600 dark:text-emerald-400 font-bold' : hasVotes ? 'text-red-500 font-semibold' : 'text-gray-400';

      return `
        <td class="px-2 py-3 text-center">
          <div class="flex flex-col items-center gap-0.5">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-extrabold shadow-sm ${pillCls}">
              ${distractor.choice}
            </span>
            <span class="text-[10px] font-bold ${countCls}">${distractor.count}</span>
            <span class="text-[9px] text-gray-400">${distractor.percentage}%</span>
          </div>
        </td>`;
    };

    // BLANK/skipped summary cell
    const blankCell = (distractor) => {
      if (!distractor || distractor.count === 0) return '<td class="px-2 py-3 text-center text-gray-300 text-[10px]">—</td>';
      return `<td class="px-2 py-3 text-center">
        <div class="flex flex-col items-center gap-0.5">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">—</span>
          <span class="text-[10px] font-semibold text-gray-500">${distractor.count}</span>
          <span class="text-[9px] text-gray-400">${distractor.percentage}%</span>
        </div>
      </td>`;
    };

    tbody.innerHTML = items.map((item) => {
      const da = item.distractorAnalysis || [];
      const dA    = da.find(d => d.choice === 'A');
      const dB    = da.find(d => d.choice === 'B');
      const dC    = da.find(d => d.choice === 'C');
      const dD    = da.find(d => d.choice === 'D');
      const dBlnk = da.find(d => d.choice === 'BLANK');
      const key   = item.correctAnswer || null;

      // Re-colour headers dynamically via data-correct attribute
      // (the header letters A/B/C/D are static green/red;
      //  the cell colouring handles per-item correctness correctly)

      const discrimStr = item.discriminationIndex !== null
        ? `<span class="${item.discriminationIndex < 0.2 ? 'text-amber-500 font-bold' : 'text-gray-700 dark:text-gray-200'}">${item.discriminationIndex}</span>`
        : '<span class="text-gray-300">N/A</span>';

      const pbiStr = item.pointBiserial !== null
        ? `<span class="${item.pointBiserial < 0.15 ? 'text-amber-500 font-bold' : 'text-gray-700 dark:text-gray-200'}">${item.pointBiserial}</span>`
        : '<span class="text-gray-300">N/A</span>';

      const bandCls = {
        VERY_EASY:      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        EASY:           'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        MODERATE:       'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        DIFFICULT:      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        VERY_DIFFICULT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      }[item.difficultyBand] || 'bg-gray-100 text-gray-600';

      const qCls = {
        EXCELLENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        GOOD:      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        REVIEW:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        NEEDS_REVISION: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      }[item.qualityRating] || 'bg-gray-100 text-gray-600';

      return `
        <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
          <td class="px-3 py-3 text-center font-extrabold text-gray-900 dark:text-white text-sm">${item.itemNumber}</td>
          ${choiceCell(dA, key)}
          ${choiceCell(dB, key)}
          ${choiceCell(dC, key)}
          ${choiceCell(dD, key)}
          ${blankCell(dBlnk)}
          <td class="px-3 py-3 text-center font-bold text-gray-900 dark:text-white">${item.difficultyPercentage}%</td>
          <td class="px-3 py-3 text-center">
            <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-full ${bandCls}">${item.difficultyBand.replace('_', ' ')}</span>
          </td>
          <td class="px-3 py-3 text-center font-mono text-[11px]">${discrimStr}</td>
          <td class="px-3 py-3 text-center font-mono text-[11px]">${pbiStr}</td>
          <td class="px-3 py-3 text-center">
            <span class="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${qCls}">${item.qualityRating.replace('_', ' ')}</span>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error('[Workspace] Item analysis load failed', err);
    const tbody = el('item-analysis-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-xs text-red-400">Failed to load item analysis. Please try again.</td></tr>`;
  }
}

async function renderResultsCompetencies() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  try {
    const compList = await AssessmentApi.getCompetencyAnalysis(assessment.id);
    const container = el('competency-mastery-list');
    if (!container) return;

    if (!compList || !compList.length) {
      container.innerHTML = `
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
          <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">No competency mapping found</p>
          <p class="text-xs text-gray-400">Link a TOS document and submit exam responses to see mastery analysis.</p>
        </div>`;
      return;
    }

    container.innerHTML = compList.map((c) => {
      const isPassed = c.status === 'MASTERY';
      const isNear   = c.status === 'NEAR_MASTERY';

      const barCls   = isPassed ? 'bg-emerald-500' : isNear ? 'bg-amber-400' : 'bg-red-400';
      const badgeCls = isPassed
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
        : isNear
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      const pctCls   = isPassed ? 'text-emerald-600 dark:text-emerald-400' : isNear ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400';

      const correctCount  = Math.round((c.masteryPercentage / 100) * (c.totalItems || 0));
      const incorrectCount = (c.totalItems || 0) - correctCount;

      return `
        <div class="px-5 py-4 flex flex-col gap-2.5">
          <!-- Top row: name, badge, percentage -->
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-bold text-gray-900 dark:text-white leading-snug">${escapeHTML(c.competencyCode ? c.competencyCode + ' — ' : '')}${escapeHTML(c.competencyName)}</p>
              <p class="text-[10px] text-gray-400 mt-0.5">${c.totalItems || 0} item${(c.totalItems || 0) !== 1 ? 's' : ''} mapped · ${c.totalStudents || 0} students</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-lg font-extrabold ${pctCls}">${c.masteryPercentage}%</span>
              <span class="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${badgeCls}">${c.status.replace('_', ' ')}</span>
            </div>
          </div>
          <!-- Progress bar -->
          <div class="w-full bg-gray-100 dark:bg-gray-700/60 h-2.5 rounded-full overflow-hidden">
            <div class="${barCls} h-full rounded-full transition-all duration-700" style="width: ${c.masteryPercentage}%"></div>
          </div>
          <!-- Correct / Incorrect breakdown -->
          <div class="flex items-center gap-4 text-[10px]">
            <span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              ${correctCount} correct
            </span>
            <span class="flex items-center gap-1 text-red-500 dark:text-red-400 font-semibold">
              <span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>
              ${incorrectCount} incorrect
            </span>
            ${ c.masteryPercentage >= 75
              ? '<span class="ml-auto text-emerald-600 font-bold">✓ Mastery Achieved</span>'
              : c.masteryPercentage >= 50
                ? '<span class="ml-auto text-amber-600 font-bold">⚠ Near Mastery</span>'
                : '<span class="ml-auto text-red-500 font-bold">✗ Below Mastery</span>'}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('[Workspace] Competency analysis load failed', err);
    const container = el('competency-mastery-list');
    if (container) container.innerHTML = `<div class="text-center py-8 text-xs text-red-400">Failed to load competency analysis.</div>`;
  }
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
function attachEventListeners() {
  document.querySelectorAll('.ws-stage-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = btn.dataset.stage;
      AssessmentStore.setStage(stage);
      const assessment = AssessmentStore.get();
      if (assessment) renderWorkspace(assessment);
    });
  });

  document.querySelectorAll('.ws-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AssessmentStore.setSubTab(btn.dataset.subtab);
      renderSubTab(btn.dataset.subtab);
    });
  });

  el('ws-status-select')?.addEventListener('change', handleStatusChange);

  el('btn-reopen')?.addEventListener('click', () => el('reopen-modal')?.classList.remove('hidden'));
  el('btn-close-reopen-modal')?.addEventListener('click', () => el('reopen-modal')?.classList.add('hidden'));
  el('btn-cancel-reopen')?.addEventListener('click', () => el('reopen-modal')?.classList.add('hidden'));
  el('btn-submit-reopen')?.addEventListener('click', handleReopen);
  el('reopen-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) el('reopen-modal')?.classList.add('hidden'); });

  el('btn-mark-all-present')?.addEventListener('click', markAllPresent);
  el('btn-save-attendance')?.addEventListener('click', saveAttendance);

  el('btn-attendance-prev')?.addEventListener('click', async () => { if (attendancePage > 1) { attendancePage--; await renderExamDayStage(); } });
  el('btn-attendance-next')?.addEventListener('click', async () => { if (attendancePage < attendanceTotalPages) { attendancePage++; await renderExamDayStage(); } });

  el('btn-responses-prev')?.addEventListener('click', async () => { if (responsePageNum > 1) { responsePageNum--; await renderResultsStage(); } });
  el('btn-responses-next')?.addEventListener('click', async () => { if (responsePageNum < responsesTotalPages) { responsePageNum++; await renderResultsStage(); } });

  el('btn-close-override-modal')?.addEventListener('click', closeOverrideModal);
  el('btn-cancel-override')?.addEventListener('click', closeOverrideModal);
  el('btn-submit-override')?.addEventListener('click', handleScoreOverride);
  el('score-override-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeOverrideModal(); });

  // Phase 5 Results Engine Listeners
  document.querySelectorAll('.results-subtab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      activeResultsTab = btn.dataset.resultsTab;
      document.querySelectorAll('.results-subtab-btn').forEach(b => {
        const isCurrent = b.dataset.resultsTab === activeResultsTab;
        b.className = `results-subtab-btn px-4 py-2 text-xs font-semibold rounded-lg transition ${
          isCurrent ? 'bg-brand-500 text-white shadow-xs' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`;
      });
      document.querySelectorAll('.results-panel').forEach(p => {
        p.classList.toggle('hidden', p.id !== `results-panel-${activeResultsTab}`);
      });
      await renderResultsStage();
    });
  });

  el('filter-results-student-search')?.addEventListener('input', async () => {
    responsePageNum = 1;
    await renderResultsStudents();
  });

  el('btn-export-results-csv')?.addEventListener('click', () => {
    const assessment = AssessmentStore.get();
    if (!assessment) return;
    window.location.href = AssessmentApi.getResultsExportCsvUrl(assessment.id);
  });

  // Phase 4 OMR Form & Scanner Listeners
  el('btn-generate-omr-form')?.addEventListener('click', handleGenerateOmrForm);
  el('btn-print-omr-form')?.addEventListener('click', handlePrintOmrForm);
  el('btn-trigger-file-select')?.addEventListener('click', () => el('scan-file-input')?.click());
  el('scan-file-input')?.addEventListener('change', handleFileInputChange);
  el('btn-submit-scan')?.addEventListener('click', handleScanSubmission);
  el('btn-close-verification-modal')?.addEventListener('click', closeVerificationModal);
  el('btn-approve-verification')?.addEventListener('click', () => handleVerificationReview('APPROVE'));
  el('btn-override-verification')?.addEventListener('click', () => handleVerificationReview('OVERRIDE'));
  el('btn-reject-verification')?.addEventListener('click', () => handleVerificationReview('REJECT'));
  el('verification-review-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeVerificationModal(); });
}

// ─── STATUS CHANGE (WITH OPTIMISTIC CONCURRENCY) ──────────────────────────────
async function handleStatusChange() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const select = el('ws-status-select');
  const newStatus = select?.value;
  if (!newStatus || newStatus === assessment.status) return;

  // Intercept attempts to revert back to DRAFT from READY, PROCESSING, or FINALIZED
  if (newStatus === 'DRAFT' && assessment.status !== 'DRAFT') {
    if (select) select.value = assessment.status;
    el('reopen-modal')?.classList.remove('hidden');
    showToast('To revert an assessment to DRAFT, please complete the Reopen request form.', 'info');
    return;
  }

  try {
    // Pass expected version for optimistic concurrency protection
    await AssessmentApi.updateAssessmentStatus(assessment.id, newStatus, assessment.version);
    await AssessmentStore.load(assessment.id);
    showToast(`Status updated to ${newStatus}`, 'success');
  } catch (err) {
    console.error('[Workspace] Status update failed', err);

    if (err?.status === 409) {
      showToast('Conflict: Assessment has been modified elsewhere. Reloading data…', 'error');
      await AssessmentStore.load(assessment.id);
    } else {
      showToast(err?.message || 'Failed to update status', 'error');
      if (select) select.value = assessment.status;
    }
  }
}

// ─── REOPEN ───────────────────────────────────────────────────────────────────
async function handleReopen() {
  const reason = el('reopen-reason')?.value?.trim();
  if (!reason || reason.length < 10) {
    showToast('Please provide a reason of at least 10 characters', 'error');
    return;
  }

  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const btn = el('btn-submit-reopen');
  if (btn) { btn.disabled = true; btn.textContent = 'Reopening…'; }

  try {
    await AssessmentApi.reopenAssessment(assessment.id, reason);
    el('reopen-modal')?.classList.add('hidden');
    if (el('reopen-reason')) el('reopen-reason').value = '';
    showToast('Assessment reopened successfully', 'success');
    await AssessmentStore.load(assessment.id);
  } catch (err) {
    console.error('[Workspace] Reopen failed', err);
    showToast(err?.message || 'Failed to reopen assessment', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Reopen'; }
  }
}

// ─── ATTENDANCE HELPERS ────────────────────────────────────────────────────────
function markAllPresent() {
  document.querySelectorAll('.attendance-status-select').forEach(select => {
    select.value = 'PRESENT';
    updateSelectColor(select);
  });
}

async function saveAttendance() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const records = [];
  document.querySelectorAll('.attendance-status-select').forEach(select => {
    const lrn = select.dataset.lrn;
    const status = select.value;
    const notesInput = document.querySelector(`.attendance-notes-input[data-lrn="${lrn}"]`);
    const notes = notesInput?.value?.trim() || null;
    records.push({ studentLrn: lrn, status, notes });
  });

  if (!records.length) { showToast('No attendance records to save', 'info'); return; }

  const btn = el('btn-save-attendance');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    await AssessmentApi.updateAttendance(assessment.id, records);
    showToast('Attendance saved successfully', 'success');
  } catch (err) {
    console.error('[Workspace] Save attendance failed', err);
    showToast(err?.message || 'Failed to save attendance', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Save Attendance`; }
  }
}

function updateSelectColor(select) {
  const v = select.value;
  const cls = v === 'PRESENT'
    ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400'
    : v === 'ABSENT'
      ? 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
      : 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
  select.className = `attendance-status-select px-2 py-1 text-[10px] font-bold uppercase rounded-lg border-0 ${cls} focus:ring-2 focus:ring-brand-500 cursor-pointer`;
}

// ─── SCORE OVERRIDE ───────────────────────────────────────────────────────────
function openOverrideModal(responseId, studentName, currentScore) {
  el('override-response-id').value = responseId;
  setText('override-student-name', studentName);
  if (el('override-new-score')) el('override-new-score').value = currentScore;
  if (el('override-reason')) el('override-reason').value = '';
  el('score-override-modal')?.classList.remove('hidden');
}

function closeOverrideModal() {
  el('score-override-modal')?.classList.add('hidden');
}

async function handleScoreOverride() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const responseId = parseInt(el('override-response-id')?.value);
  const newScore = parseFloat(el('override-new-score')?.value);
  const reason = el('override-reason')?.value?.trim();

  if (!responseId || isNaN(newScore) || newScore < 0) {
    showToast('Please enter a valid score', 'error');
    return;
  }
  if (!reason || reason.length < 10) {
    showToast('Please provide a reason (at least 10 characters)', 'error');
    return;
  }

  const btn = el('btn-submit-override');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }

  try {
    await AssessmentApi.overrideScore(assessment.id, responseId, newScore, reason);
    closeOverrideModal();
    showToast('Score override applied and audited', 'success');
    await renderResultsStage();
  } catch (err) {
    console.error('[Workspace] Score override failed', err);
    showToast(err?.message || 'Failed to apply score override', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply Override'; }
  }
}

// ─── OMR FORM GENERATION & PRINTING ──────────────────────────────────────────
async function handleGenerateOmrForm() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const btn = el('btn-generate-omr-form');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  try {
    const res = await AssessmentApi.generateOmrForm(assessment.id);
    showToast(`OMR Answer Sheet Form generated (${res.omrForm.itemCount} items)!`, 'success');
  } catch (err) {
    console.error('[Workspace] OMR Form generation failed', err);
    showToast(err?.message || 'Failed to generate OMR form. Ensure Answer Key exists first.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate Sheet'; }
  }
}

function handlePrintOmrForm() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;
  const printUrl = AssessmentApi.getOmrFormPrintUrl(assessment.id);
  window.open(printUrl, '_blank');
}

// ─── PHASE 4 OMR SCANNER & VERIFICATION WORKFLOW ──────────────────────────────
let selectedScanBase64 = null;

function handleFileInputChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('File exceeds maximum size limit of 10MB', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    selectedScanBase64 = reader.result;
    showToast(`Loaded ${file.name} (${(file.size / 1024).toFixed(0)} KB)`, 'info');
  };
  reader.readAsDataURL(file);
}

async function handleScanSubmission() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  if (!selectedScanBase64) {
    // Generate dummy sheet image base64 if no image chosen to test scan ingestion
    selectedScanBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }

  const idempotencyKey = el('scan-idempotency-key')?.value || `scan-${Date.now()}`;
  const studentLrn = el('scan-student-lrn')?.value?.trim() || undefined;

  const btn = el('btn-submit-scan');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing Scan…'; }

  try {
    const res = await AssessmentApi.submitScan(assessment.id, idempotencyKey, selectedScanBase64, studentLrn);
    if (res.isDuplicate) {
      showToast('Idempotent scan handling: Duplicate scan request returned existing result.', 'info');
    } else if (res.verificationItem) {
      showToast(`Scan ingested & routed to Verification Queue: ${res.verificationItem.reason}`, 'info');
    } else {
      showToast('Scan queued for verification review.', 'info');
    }

    // Refresh exam day stage (attendance & verification queue)
    await renderExamDayStage();
  } catch (err) {
    console.error('[Workspace] Scan processing failed', err);
    showToast(err?.message || 'Failed to process scan image', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Process Scan`;
    }
  }
}

function openVerificationModal(itemId) {
  const item = loadedVerificationItems.find(i => i.id === itemId);
  if (!item) return;

  el('verify-item-id').value = item.id;
  setText('verify-reason', item.reason);

  const prev = el('verify-answers-preview');
  if (prev) {
    let answers = [];
    try { answers = JSON.parse(item.scanResult?.normalizedAnswers || '[]'); } catch (e) {}
    if (answers.length > 0) {
      prev.innerHTML = answers.map((a, i) => `
        <div class="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
          <span class="font-bold text-gray-700 dark:text-gray-300">Q${i + 1}</span>
          <select data-item-idx="${i}" class="verify-answer-override-input px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs">
            <option value="" ${!a ? 'selected' : ''}>BLANK / NONE</option>
            <option value="A" ${a === 'A' ? 'selected' : ''}>A</option>
            <option value="B" ${a === 'B' ? 'selected' : ''}>B</option>
            <option value="C" ${a === 'C' ? 'selected' : ''}>C</option>
            <option value="D" ${a === 'D' ? 'selected' : ''}>D</option>
          </select>
        </div>
      `).join('');
    } else {
      prev.textContent = 'No answers detected';
    }
  }

  // Populate student select options from roster
  const select = el('verify-student-select');
  if (select) {
    const assessment = AssessmentStore.get();
    AssessmentApi.getAttendance(assessment.id, 1, 100).then(res => {
      const records = Array.isArray(res?.data?.records) ? res.data.records : Array.isArray(res?.records) ? res.records : Array.isArray(res?.data) ? res.data : [];
      select.innerHTML = `<option value="">Select student from roster…</option>` +
        records.map(r => `<option value="${r.studentId}" ${r.studentId === item.studentId ? 'selected' : ''}>${escapeHTML(r.student?.name || r.studentLrn)} (${r.studentLrn})</option>`).join('');
    });
  }

  el('verification-review-modal')?.classList.remove('hidden');
}

function closeVerificationModal() {
  el('verification-review-modal')?.classList.add('hidden');
}

async function handleVerificationReview(action) {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  const itemId = parseInt(el('verify-item-id')?.value);
  const studentId = parseInt(el('verify-student-select')?.value);

  if (action !== 'REJECT' && !studentId) {
    showToast('Please select a student from the roster to assign this scan to.', 'error');
    return;
  }

  // Collect modified answer choices from override dropdowns
  const answerInputs = document.querySelectorAll('.verify-answer-override-input');
  const overriddenAnswers = [];
  answerInputs.forEach(input => {
    const val = input.value?.trim() || null;
    overriddenAnswers.push(val);
  });

  const overrides = {
    studentId,
    ...(overriddenAnswers.length > 0 ? { answers: overriddenAnswers } : {}),
  };

  try {
    await AssessmentApi.reviewVerificationItem(assessment.id, itemId, action, overrides);
    closeVerificationModal();
    showToast(`Verification scan ${action.toLowerCase()}ed successfully.`, 'success');
    await renderExamDayStage();
  } catch (err) {
    console.error('[Workspace] Verification review failed', err);
    showToast(err?.message || 'Failed to review verification item', 'error');
  }
}
// ─── STAGE 4: ACADEMIC INTELLIGENCE & REMEDIATION WORKSPACE ───────────────────
let activeIntelTab = 'weaknesses';
let activeRemediationPlanId = null;
let activeReassessmentProposalId = null;

async function renderIntelligenceStage() {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  try {
    const weaknesses = await IntelligenceApi.getAssessmentWeaknesses(assessment.id);
    const tbody = el('intel-weakness-tbody');
    if (!tbody) return;

    if (!weaknesses || !weaknesses.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-xs text-gray-400">No student responses available for intelligence analysis yet.</td></tr>`;
      return;
    }

    const rows = [];
    weaknesses.forEach((st) => {
      st.competencies.forEach((comp) => {
        if (comp.status === 'CRITICAL' || comp.status === 'NEEDS_SUPPORT' || comp.status === 'DEVELOPING') {
          const prioColor = comp.priority === 'CRITICAL'
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            : comp.priority === 'HIGH'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';

          rows.push(`
            <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-white text-xs">${escapeHTML(st.studentName)}</td>
              <td class="px-4 py-2.5 font-mono text-gray-400 text-xs">${escapeHTML(st.studentLrn)}</td>
              <td class="px-4 py-2.5 text-center font-extrabold text-gray-900 dark:text-white">${st.overallPercentage}%</td>
              <td class="px-4 py-2.5 font-bold text-brand-600 dark:text-brand-400">${escapeHTML(comp.competencyName)}</td>
              <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300 text-xs">${escapeHTML(comp.evidence)}</td>
              <td class="px-4 py-2.5 text-center">
                <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${prioColor}">${comp.priority}</span>
              </td>
              <td class="px-4 py-2.5 text-center">
                <button class="btn-generate-remediation px-3 py-1 text-[10px] font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg shadow-xs transition" data-student-id="${st.studentId}" data-competency="${escapeHTML(comp.competencyName)}">
                  Generate Remediation
                </button>
              </td>
            </tr>
          `);
        }
      });
    });

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-xs text-emerald-600 font-bold">🎉 All students have achieved competency mastery! No critical weaknesses detected.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.join('');

    tbody.querySelectorAll('.btn-generate-remediation').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleGenerateRemediation(parseInt(btn.dataset.studentId), btn.dataset.competency);
      });
    });
  } catch (err) {
    console.error('[Workspace] Intelligence weakness load failed', err);
  }
}

async function handleGenerateRemediation(studentId, competencyName) {
  const assessment = AssessmentStore.get();
  if (!assessment) return;

  try {
    showToast(`Generating AI practice activity for ${competencyName}…`, 'info');
    const plan = await IntelligenceApi.generateRemediationPlan(assessment.id, studentId, competencyName);
    activeRemediationPlanId = plan.id;

    setText('remediation-modal-competency', plan.competencyName);
    setText('remediation-modal-mastery', `${plan.masteryPercentage}%`);

    let activitiesObj = {};
    try {
      activitiesObj = JSON.parse(plan.activities);
    } catch (e) {}

    const objectiveInput = el('remediation-modal-objective');
    if (objectiveInput) objectiveInput.value = activitiesObj.learningObjective || '';

    const instructionsInput = el('remediation-modal-instructions');
    if (instructionsInput) instructionsInput.value = activitiesObj.instructions || '';

    const container = el('remediation-modal-activities-container');
    if (container && Array.isArray(activitiesObj.activities)) {
      container.innerHTML = activitiesObj.activities.map((act, idx) => `
        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 space-y-1 text-xs">
          <span class="font-bold text-gray-900 dark:text-white">Activity ${idx + 1} (${act.type}):</span>
          <p class="text-gray-700 dark:text-gray-300 font-medium">${escapeHTML(act.question)}</p>
          <p class="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Key: ${escapeHTML(act.correctAnswer)}</p>
        </div>
      `).join('');
    }

    el('remediation-review-modal')?.classList.remove('hidden');
  } catch (err) {
    console.error('[Workspace] Remediation generation failed', err);
    showToast(err?.message || 'Failed to generate AI remediation', 'error');
  }
}

// Stage 4 Sub-tab Listener setup inside attachEventListeners
document.querySelectorAll('.intel-subtab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    activeIntelTab = btn.dataset.intelTab;
    document.querySelectorAll('.intel-subtab-btn').forEach(b => {
      const isCurrent = b.dataset.intelTab === activeIntelTab;
      b.className = `intel-subtab-btn px-4 py-2 text-xs font-semibold rounded-lg transition ${
        isCurrent ? 'bg-brand-500 text-white shadow-xs' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`;
    });
    document.querySelectorAll('.intel-panel').forEach(p => {
      p.classList.toggle('hidden', p.id !== `intel-panel-${activeIntelTab}`);
    });
    if (activeIntelTab === 'weaknesses') await renderIntelligenceStage();
  });
});

el('btn-close-remediation-modal')?.addEventListener('click', () => el('remediation-review-modal')?.classList.add('hidden'));
el('btn-close-remediation-cancel')?.addEventListener('click', () => el('remediation-review-modal')?.classList.add('hidden'));

el('btn-approve-assign-remediation')?.addEventListener('click', async () => {
  if (!activeRemediationPlanId) return;
  try {
    const editedObjective = el('remediation-modal-objective')?.value;
    const editedInstructions = el('remediation-modal-instructions')?.value;
    const editedPayload = { learningObjective: editedObjective, instructions: editedInstructions };

    await IntelligenceApi.reviewRemediationPlan(activeRemediationPlanId, 'APPROVE', editedPayload);
    await IntelligenceApi.assignRemediationPlan(activeRemediationPlanId);

    el('remediation-review-modal')?.classList.add('hidden');
    showToast('Remediation practice activity approved & assigned to student!', 'success');
    await renderIntelligenceStage();
  } catch (err) {
    showToast(err?.message || 'Failed to approve remediation activity', 'error');
  }
});

