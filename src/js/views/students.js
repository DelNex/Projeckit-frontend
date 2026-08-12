import { escapeHTML, debounce, resolveSectionName, ensureAddSectionsLink } from '../utils.js';
import { ResponseStore } from '../stores/response-store.js';
import { NoData } from '../components/no-data.js';
import { ConfigStore } from '../stores/config-store.js';
import { AppSettingsStore } from '../stores/app-settings-store.js';
import { GridEngine } from '../components/grid-engine.js';

let studentRosterStore = [];
let baseRoster = [];
let activeTerm = 'First Quarter';
let activeFilter = 'all';
let activeGrade = 'all';
let activeStrand = 'all';
let activeSection = 'all';
let searchQuery = '';
let isEditMode = false;
let masterConfig = {};
let gridEngineInstance = null;
let pendingDeleteLrn = null;

export function initStudentsView() {
  console.log('[Project KIT] Initializing GridEngine Learner Roster');

  masterConfig = ConfigStore.getSafe();
  baseRoster = masterConfig.students || [];
  activeTerm = masterConfig.academicPeriod?.term || 'First Quarter';

  buildStudentRosterStore();

  gridEngineInstance = new GridEngine({
    tableId: 'students-table-body',
    bulkBarId: 'bulk-action-bar',
    data: studentRosterStore
  });

  // ARCH-001: Add delegated event listeners to the table body
  addTableEventListeners();

  renderSectionPicker();
  renderSummaryMetrics();
  renderStudentRoster(); // Initial render

  // Edit Roster Header Button Listener (TOS Style Document Edit Toggle)
  const toggleEditBtn = document.getElementById('btn-edit-roster-toggle');
  const editBtnText = document.getElementById('edit-roster-btn-text');
  const thActions = document.getElementById('th-actions');

  function updateEditModeUI() {
    if (isEditMode) {
      if (toggleEditBtn) toggleEditBtn.className = 'px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-full shadow-xs transition flex items-center gap-1.5';
      if (editBtnText) editBtnText.textContent = 'Exit Edit Mode';
      if (thActions) thActions.classList.remove('hidden');
    } else {
      if (toggleEditBtn) toggleEditBtn.className = 'px-3.5 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-full shadow-xs transition flex items-center gap-1.5';
      if (editBtnText) editBtnText.textContent = 'Edit Roster';
      if (thActions) thActions.classList.add('hidden');
      studentRosterStore = studentRosterStore.map(s => ({ ...s, isEditing: false }));
    }
    renderStudentRoster();
  }

  if (toggleEditBtn) {
    toggleEditBtn.addEventListener('click', () => {
      isEditMode = !isEditMode;
      updateEditModeUI();
    });
  }

  // Card 2 Quick Filter Click Handlers
  const boxOutstanding = document.getElementById('filter-box-outstanding');
  const boxSatisfactory = document.getElementById('filter-box-satisfactory');
  const boxRemediation = document.getElementById('filter-box-remediation');
  const bandSelect = document.getElementById('band-select-filter');

  if (boxOutstanding) {
    boxOutstanding.addEventListener('click', () => {
      activeFilter = activeFilter === 'Outstanding' ? 'all' : 'Outstanding';
      if (bandSelect) bandSelect.value = activeFilter;
      renderStudentRoster();
    });
  }
  if (boxSatisfactory) {
    boxSatisfactory.addEventListener('click', () => {
      activeFilter = activeFilter === 'Satisfactory' ? 'all' : 'Satisfactory';
      if (bandSelect) bandSelect.value = activeFilter;
      renderStudentRoster();
    });
  }
  if (boxRemediation) {
    boxRemediation.addEventListener('click', () => {
      activeFilter = activeFilter === 'Did Not Meet Expectations' ? 'all' : 'Did Not Meet Expectations';
      if (bandSelect) bandSelect.value = activeFilter;
      renderStudentRoster();
    });
  }

  // Top header Export Roster button listener
  const exportHeaderBtn = document.getElementById('btn-export-roster');
  if (exportHeaderBtn) {
    exportHeaderBtn.addEventListener('click', () => {
      alert(`Exporting complete classification roster (${studentRosterStore.length} students)...`);
    });
  }

  // Global Header Search-as-you-type listener
  const debouncedRender = debounce(() => renderStudentRoster(), 300);
  const globalSearchInput = document.getElementById('search-input') || document.getElementById('search-students-input');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      debouncedRender();
    });
  }

  // Quarter Dropdown Filter Listener
  const quarterSelect = document.getElementById('term-select-filter');
  if (quarterSelect) {
    quarterSelect.value = activeTerm;
    quarterSelect.addEventListener('change', (e) => {
      activeTerm = e.target.value;
      masterConfig.academicPeriod = masterConfig.academicPeriod || {};
      masterConfig.academicPeriod.term = activeTerm;
      ConfigStore.save(masterConfig);
      isEditMode = false;
      buildStudentRosterStore();
      renderSectionPicker();
      renderStudentRoster();
    });
  }

  // Grade Level Dropdown Filter Listener
  const gradeSelect = document.getElementById('grade-select-filter');
  if (gradeSelect) {
    gradeSelect.addEventListener('change', (e) => {
      activeGrade = e.target.value;
      activeSection = 'all';
      renderSectionPicker();
      renderStudentRoster();
    });
  }

  // Strand Dropdown Filter Listener
  const strandSelect = document.getElementById('strand-select-filter');
  if (strandSelect) {
    strandSelect.addEventListener('change', (e) => {
      activeStrand = e.target.value;
      activeSection = 'all';
      renderSectionPicker();
      renderStudentRoster();
    });
  }

  // Section Dropdown Filter Listener
  const sectionSelect = document.getElementById('section-select-filter');
  if (sectionSelect) {
    sectionSelect.addEventListener('change', (e) => {
      activeSection = e.target.value;
      renderStudentRoster();
    });
  }

  // Classification Band Dropdown Filter Listener
  if (bandSelect) {
    bandSelect.addEventListener('change', (e) => {
      activeFilter = e.target.value;
      renderStudentRoster();
    });
  }

  // Select All Checkbox
  const selectAllCheckbox = document.getElementById('select-all-students');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = isChecked);
      gridEngineInstance.toggleSelectAll(isChecked);
    });
  }

  // Bulk Export Remediation Trigger
  const bulkExportBtn = document.getElementById('btn-bulk-export-remediation');
  if (bulkExportBtn) {
    bulkExportBtn.addEventListener('click', () => {
      alert(`Exporting Remediation Roster for ${gridEngineInstance?.selectedIds?.size || 0} selected student(s)...`);
    });
  }

  // Bulk Delete Trigger
  const bulkDeleteBtn = document.getElementById('btn-bulk-delete-students');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
      const selectedCount = gridEngineInstance?.selectedIds?.size || 0;
      if (selectedCount === 0) return;
      if (confirm(`Are you sure you want to delete ${selectedCount} selected student record(s)?`)) {
        studentRosterStore = studentRosterStore.filter(s => !gridEngineInstance.selectedIds.has(s.lrn));
        gridEngineInstance.selectedIds.clear();
        renderStudentRoster();
        if (gridEngineInstance) gridEngineInstance.updateBulkActionBar();
      }
    });
  }

  // Delete Confirmation Handler
  const confirmDeleteBtn = document.getElementById('btn-confirm-delete-student');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (pendingDeleteLrn === null) return;
      studentRosterStore = studentRosterStore.filter(s => s.lrn !== pendingDeleteLrn);
      if (masterConfig.students) {
        masterConfig.students = masterConfig.students.filter(s => s.lrn !== pendingDeleteLrn);
        ConfigStore.save(masterConfig);
      }
      if (gridEngineInstance) gridEngineInstance.selectedIds.delete(pendingDeleteLrn);
      pendingDeleteLrn = null;
      document.getElementById('delete-student-modal')?.classList.add('hidden');
      renderStudentRoster();
      if (gridEngineInstance) gridEngineInstance.updateBulkActionBar();
    });
  }
}

/**
 * ARCH-001: Adds delegated event listeners to the student roster table to handle
 * direct raw grade edits and row deletion without requiring individual row edit mode toggles.
 */
function buildStudentRosterStore() {
  const responseMap = new Map();

  baseRoster.forEach(baseStudent => {
    const responses = ResponseStore.getForSection(baseStudent.section, activeTerm);
    if (Array.isArray(responses)) {
      responses.forEach(res => {
        if (res && res.lrn) responseMap.set(res.lrn, res);
      });
    }
  });

  studentRosterStore = baseRoster.map(baseStudent => {
    const responseData = responseMap.get(baseStudent.lrn);
    let score = 0;
    let totalItems = 0; // Default for students without exam responses

    if (responseData && Array.isArray(responseData.responses)) {
      score = responseData.responses.reduce((sum, val) => sum + (Number(val) || 0), 0);
      totalItems = responseData.responses.length;
    }

    const mps = totalItems > 0 ? (score / totalItems) * 100 : 0;
    const classification = recomputeClassification(score, totalItems);

    return { ...baseStudent, score, totalItems, mps, classification, isEditing: false };
  });
}

function addTableEventListeners() {
  const tableBody = document.getElementById('students-table-body');
  if (!tableBody) return;

  // Direct Inline Score Input Listener (Auto-calculates MPS & Classification)
  tableBody.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-action="score-input"]');
    if (!input) return;

    const lrn = input.dataset.lrn;
    const student = studentRosterStore.find(s => s.lrn === lrn);
    if (!student) return;

    const maxItems = student.totalItems || 40;
    let newScore = parseInt(input.value, 10);
    if (isNaN(newScore)) newScore = 0;
    if (newScore < 0) newScore = 0;
    if (newScore > maxItems) newScore = maxItems;

    student.score = newScore;
    student.mps = maxItems > 0 ? (newScore / maxItems) * 100 : 0;
    student.classification = recomputeClassification(newScore, maxItems);

    renderSummaryMetrics();

    // Update table row cells dynamically
    const row = input.closest('tr');
    if (row) {
      const mpsTd = row.querySelector('.col-mps');
      const classTd = row.querySelector('.col-classification');

      if (mpsTd) mpsTd.textContent = `${student.mps.toFixed(1)}%`;
      if (classTd) {
        classTd.innerHTML = `<span class="${getClassificationBadge(student.classification)}">${escapeHTML(shortenClassification(student.classification))}</span>`;
      }
    }
  });

  // Listener for clicks on action buttons (e.g. delete)
  tableBody.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const { action, lrn } = button.dataset;
    if (!action || !lrn) return;

    e.preventDefault();

    if (action === 'delete') {
      pendingDeleteLrn = lrn;
      const modal = document.getElementById('delete-student-modal');
      if (modal) modal.classList.remove('hidden');
    }
  });

  // Listener for changes on checkboxes
  tableBody.addEventListener('change', (e) => {
    const checkbox = e.target;
    if (checkbox.matches('.row-checkbox')) {
      const lrn = checkbox.value;
      const isChecked = checkbox.checked;
      if (gridEngineInstance) {
        gridEngineInstance.toggleSelectRow(lrn, isChecked);
      }
    }
  });
}

function renderSummaryMetrics() {
  const examineesEl = document.getElementById('stat-total-examinees');
  const avgMpsEl = document.getElementById('stat-avg-mps');
  const passRateEl = document.getElementById('stat-pass-rate');
  const countOutstandingEl = document.getElementById('stat-count-outstanding');
  const countSatisfactoryEl = document.getElementById('stat-count-satisfactory');
  const countRemediationEl = document.getElementById('stat-count-remediation');
  const activeSectionTagEl = document.getElementById('stat-active-section-tag');
  const remediationNeededEl = document.getElementById('stat-remediation-needed-count');

  if (!examineesEl) return;

  const sectionStudents = studentRosterStore.filter(s => {
    return matchesSelectedGrade(s) &&
      (activeSection === 'all' || s.section === activeSection) &&
      (activeStrand === 'all' || (s.strand || '').toLowerCase().includes(activeStrand.toLowerCase()));
  });
  const totalCount = sectionStudents.length;

  const sumMps = sectionStudents.reduce((acc, s) => acc + (s.mps || 0), 0);
  const avgMps = totalCount > 0 ? sumMps / totalCount : 0;

  const passingCount = sectionStudents.filter(s => (s.mps || 0) >= 75).length;
  const passRate = totalCount > 0 ? (passingCount / totalCount) * 100 : 0;

  const outstandingCount = sectionStudents.filter(s => s.classification === 'Outstanding').length;
  const satisfactoryCount = sectionStudents.filter(s => s.classification === 'Very Satisfactory' || s.classification === 'Satisfactory' || s.classification === 'Fairly Satisfactory').length;
  const remediationCount = sectionStudents.filter(s => s.classification === 'Did Not Meet Expectations').length;

  examineesEl.textContent = totalCount;
  if (avgMpsEl) avgMpsEl.textContent = `${avgMps.toFixed(1)}%`;
  if (passRateEl) passRateEl.textContent = `${passRate.toFixed(1)}%`;

  if (countOutstandingEl) countOutstandingEl.textContent = outstandingCount;
  if (countSatisfactoryEl) countSatisfactoryEl.textContent = satisfactoryCount;
  if (countRemediationEl) countRemediationEl.textContent = remediationCount;

  if (activeSectionTagEl) {
    activeSectionTagEl.textContent = activeSection === 'all' ? 'ALL SECTIONS' : resolveSectionName(activeSection, masterConfig).toUpperCase();
  }
  if (remediationNeededEl) remediationNeededEl.textContent = remediationCount;
}

function matchesSelectedGrade(student) {
  if (activeGrade === 'all') return true;
  const targetGradeNum = activeGrade.replace(/\D/g, '');
  if (!targetGradeNum) return true;

  const studentGradeNum = (student.grade || '').replace(/\D/g, '');
  if (studentGradeNum) {
    return studentGradeNum === targetGradeNum;
  }

  const sectionGradeNum = (student.section || '').split('-')[0].replace(/\D/g, '');
  return sectionGradeNum ? sectionGradeNum === targetGradeNum : true;
}

function renderSectionPicker() {
  const select = document.getElementById('section-select-filter');
  if (!select) return;

  const sections = Array.isArray(masterConfig.sections) ? masterConfig.sections : [];
  const strandNormalized = activeStrand === 'all' ? '' : activeStrand.replace(/\s+-\s+/g, '-').trim().toLowerCase();
  const gradeNum = activeGrade === 'all' ? '' : activeGrade.replace(/\D/g, '');

  const matchingSections = sections.filter(sec => {
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

  if ((activeStrand !== 'all' || activeGrade !== 'all') && matchingSections.length === 0) {
    select.innerHTML = `<option value="">— No sections —</option>`;
    select.disabled = true;
    activeSection = '';
    ensureAddSectionsLink(select);
    return;
  }

  select.disabled = false;
  ensureAddSectionsLink(select);

  const sectionOptions = matchingSections.map((section) => {
    const name = resolveSectionName(section.name, masterConfig);
    return `<option value="${escapeHTML(section.name)}">${escapeHTML(name)}</option>`;
  }).join('');

  select.innerHTML = `<option value="all">All Sections</option>${sectionOptions}`;
  if (matchingSections.some(s => s.name === activeSection) || activeSection === 'all') {
    select.value = activeSection;
  } else {
    activeSection = 'all';
    select.value = 'all';
  }
}

function renderStudentRoster() {
  renderSummaryMetrics();

  const container = document.getElementById('students-table-body');
  if (!container) return;

  const sectionSelect = document.getElementById('section-select-filter');
  const countBadge = document.getElementById('roster-count-badge');

  if (sectionSelect?.disabled) {
    if (countBadge) countBadge.textContent = '0 Students';
    container.innerHTML = NoData.renderTableRow(isEditMode ? 8 : 7, `No classes available for ${escapeHTML(activeStrand)}`, 'There are no classes found for this strand. Select a different strand or add sections in School Settings.', 'Open School Settings', 'config.html#sections');
    return;
  }

  const filtered = studentRosterStore.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchQuery) || student.lrn.includes(searchQuery);
    const matchesFilter = activeFilter === 'all' || student.classification === activeFilter;
    const matchesSection = activeSection === 'all' || student.section === activeSection;
    const matchesStrand = activeStrand === 'all' || (student.strand || '').toLowerCase().includes(activeStrand.toLowerCase());
    return matchesSearch && matchesFilter && matchesSection && matchesStrand && matchesSelectedGrade(student);
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Student${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="${isEditMode ? 8 : 7}" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          <p class="text-sm font-medium">No students match search criteria "${escapeHTML(searchQuery)}"</p>
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = filtered.map((student) => {
    const isSelected = gridEngineInstance?.selectedIds.has(student.lrn);

    const actionsTd = isEditMode ? `
      <td class="px-2 py-2.5 text-center w-16 whitespace-nowrap">
        <button data-action="delete" data-lrn="${escapeHTML(student.lrn)}" title="Delete Student Record" class="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </td>
    ` : '';

    const scoreCellHtml = isEditMode ? `
      <div class="flex items-center justify-center gap-1">
        <input type="number" data-action="score-input" data-lrn="${escapeHTML(student.lrn)}" value="${student.score}" min="0" max="${student.totalItems || 40}" class="w-14 text-center px-1 py-0.5 text-xs font-bold rounded border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/20 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs" />
        <span class="text-gray-400 font-normal text-xs">/ ${student.totalItems || 40}</span>
      </div>
    ` : `${student.score} / ${student.totalItems || 40}`;

    const initials = (student.name || 'S')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(n => n[0].toUpperCase())
      .join('');

    return `
      <tr class="border-b border-stroke dark:border-strokedark hover:bg-gray-50/80 dark:hover:bg-gray-800/60 transition-colors ${isEditMode ? 'bg-amber-50/20 dark:bg-amber-900/5' : ''}">
        <td class="px-2 py-2.5 text-center">
          <input type="checkbox" value="${escapeHTML(student.lrn)}" ${isSelected ? 'checked' : ''} class="row-checkbox rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500" />
        </td>
        <td class="px-2.5 py-2.5 text-xs font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">${escapeHTML(student.lrn)}</td>
        <td class="px-2.5 py-2.5 text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-[10px] shrink-0">
              ${initials}
            </div>
            <span class="font-semibold text-gray-900 dark:text-white">${escapeHTML(student.name)}</span>
          </div>
        </td>
        <td class="px-2.5 py-2.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">${escapeHTML(resolveSectionName(student.section, masterConfig))}</td>
        <td class="px-2 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap">${scoreCellHtml}</td>
        <td class="px-2 py-2.5 text-center text-xs font-extrabold text-brand-500 whitespace-nowrap col-mps">${student.mps.toFixed(1)}%</td>
        <td class="px-2.5 py-2.5 col-classification"><span class="${getClassificationBadge(student.classification)}">${escapeHTML(shortenClassification(student.classification))}</span></td>
        ${actionsTd}
      </tr>
    `;
  }).join('');
}

function getClassificationBadge(tier) {
  const base = 'whitespace-nowrap inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full';
  if (tier === 'Outstanding') return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400`;
  if (tier === 'Very Satisfactory') return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`;
  if (tier === 'Satisfactory') return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400`;
  if (tier === 'Fairly Satisfactory') return `${base} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`;
  return `${base} bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400`;
}

/** Shorten long classification labels for compact table display */
function shortenClassification(tier) {
  if (tier === 'Did Not Meet Expectations') return 'Needs Remediation';
  if (tier === 'Very Satisfactory') return 'Very Satisfactory';
  if (tier === 'Fairly Satisfactory') return 'Fairly Satisfactory';
  return tier;
}

function recomputeClassification(score, totalItems) {
  return AppSettingsStore.classificationTier(score, totalItems);
}

/**
 * The following functions are now local to this module and are invoked by the
 * delegated event listeners in `addTableEventListeners`. They no longer
 * pollute the global `window` object.
 */

function editStudentRow(lrn) {
  studentRosterStore = studentRosterStore.map(s => s.lrn === lrn ? { ...s, isEditing: true } : s);
  renderStudentRoster();
}

function cancelStudentRow(lrn) {
  studentRosterStore = studentRosterStore.map(s => s.lrn === lrn ? { ...s, isEditing: false } : s);
  renderStudentRoster();
}

function saveStudentRow(lrn) {
  const nameVal = document.getElementById(`edit-student-name-${lrn}`)?.value?.trim();
  const scoreVal = Number(document.getElementById(`edit-student-score-${lrn}`)?.value);

  studentRosterStore = studentRosterStore.map(s => {
    if (s.lrn === lrn) {
      const newScore = isNaN(scoreVal) ? s.score : scoreVal;
      const newMps = (newScore / s.totalItems) * 100;
      return {
        ...s,
        name: nameVal || s.name,
        score: newScore,
        mps: newMps,
        classification: recomputeClassification(newScore, s.totalItems),
        isEditing: false
      };
    }
    return s;
  });

  // Persist any student name changes to master config so roster edits are not lost on refresh.
  if (nameVal) {
    const target = masterConfig.students?.find((student) => student.lrn === lrn);
    if (target) {
      target.name = nameVal;
      ConfigStore.save(masterConfig);
    }
  }

  renderStudentRoster();
}

function promptDeleteStudentRow(lrn) {
  pendingDeleteLrn = lrn;
  document.getElementById('delete-student-modal')?.classList.remove('hidden');
}
