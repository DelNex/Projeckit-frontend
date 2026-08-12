// Configuration View Controller
import { ConfigStore } from '../stores/config-store.js';
import { escapeHTML, resolveSectionName } from '../utils.js';

let currentConfig = null;
let activeStudentFilterSection = 'all';

const EMPTY_CONFIG = {
  faculty: { teacherName: '', designation: '', approverName: '' },
  academicPeriod: { schoolYear: '', term: '' },
  tracksAndStrands: [],
  sections: [],
  subjects: [],
  students: [],
  userProfile: null,
};

export function initConfigView() {
  console.log('[Project KIT] Initializing Configuration View');

  // ConfigStore.get() returns null when no authoritative backend config exists.
  // Fall back to an empty config so the form renders and saves cleanly instead of crashing.
  currentConfig = ConfigStore.get() || JSON.parse(JSON.stringify(EMPTY_CONFIG));

  // Populate form fields
  const teacherEl = document.getElementById('cfg-teacher-name');
  const desigEl = document.getElementById('cfg-designation');
  const approverEl = document.getElementById('cfg-approver-name');
  const syEl = document.getElementById('cfg-school-year');
  const termEl = document.getElementById('cfg-active-term');

  if (teacherEl) teacherEl.value = currentConfig.faculty.teacherName || '';
  if (desigEl) desigEl.value = currentConfig.faculty.designation || '';
  if (approverEl) approverEl.value = currentConfig.faculty.approverName || '';
  if (syEl) syEl.value = currentConfig.academicPeriod.schoolYear || '';
  if (termEl) termEl.value = currentConfig.academicPeriod.term || '';

  renderSectionOptions(currentConfig.sections);
  renderSectionsList(currentConfig.sections);
  renderStudentRegistry(currentConfig.students);
  renderSubjectsList(currentConfig.subjects);

  // Enrolled Learners Filter Dropdown Listener
  const filterSelect = document.getElementById('cfg-filter-student-section');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      activeStudentFilterSection = e.target.value;
      renderStudentRegistry(currentConfig.students);
    });
  }

  // Save App Config Button
  const btnSave = document.getElementById('btn-save-master-config');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const origText = btnSave.innerHTML;
      btnSave.disabled = true;
      btnSave.innerHTML = `
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        Saving Configuration…
      `;
      try {
        currentConfig.faculty.teacherName = document.getElementById('cfg-teacher-name')?.value?.trim() || '';
        currentConfig.faculty.designation = document.getElementById('cfg-designation')?.value?.trim() || '';
        currentConfig.faculty.approverName = document.getElementById('cfg-approver-name')?.value?.trim() || '';
        currentConfig.academicPeriod.schoolYear = document.getElementById('cfg-school-year')?.value || '';
        currentConfig.academicPeriod.term = document.getElementById('cfg-active-term')?.value || '';

        const persisted = await ConfigStore.save(currentConfig);
        if (persisted !== false) {
          showToast('Master Configuration saved successfully!');
        }
      } catch (err) {
        showToast('Failed to save configuration. Please try again.');
      } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = origText;
      }
    });
  }

  // ── Dual Bulk Paste Registration & Live Match Handler ──
  const lrnsInput = document.getElementById('cfg-bulk-lrns');
  const namesInput = document.getElementById('cfg-bulk-names');
  const lrnBadge = document.getElementById('lrn-count-badge');
  const nameBadge = document.getElementById('name-count-badge');
  const matchStatusEl = document.getElementById('bulk-match-status');
  const btnAddStudent = document.getElementById('btn-add-student');

  function updateBulkPasteStatus() {
    const lrnText = lrnsInput?.value || '';
    const nameText = namesInput?.value || '';

    const lrnLines = lrnText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const nameLines = nameText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lrnBadge) lrnBadge.textContent = `${lrnLines.length} LRN${lrnLines.length === 1 ? '' : 's'}`;
    if (nameBadge) nameBadge.textContent = `${nameLines.length} Name${nameLines.length === 1 ? '' : 's'}`;

    if (!matchStatusEl) return;

    if (lrnLines.length === 0 && nameLines.length === 0) {
      matchStatusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-gray-300"></span> Ready to paste`;
      matchStatusEl.className = 'text-xs font-medium text-gray-500 flex items-center gap-1.5';
    } else if (lrnLines.length === nameLines.length && lrnLines.length > 0) {
      matchStatusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> Perfect match: <strong>${lrnLines.length} learners ready</strong>`;
      matchStatusEl.className = 'text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5';
    } else if (lrnLines.length > 0 && nameLines.length === 0) {
      matchStatusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-amber-500"></span> ${lrnLines.length} LRNs pasted. Please paste corresponding names.`;
      matchStatusEl.className = 'text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5';
    } else {
      const diff = Math.abs(lrnLines.length - nameLines.length);
      matchStatusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-rose-500"></span> Mismatch warning: ${lrnLines.length} LRNs vs ${nameLines.length} Names (${diff} row difference)`;
      matchStatusEl.className = 'text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5';
    }
  }

  let debounceTimer = null;
  function debouncedUpdateStatus() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateBulkPasteStatus, 300);
  }

  if (lrnsInput) lrnsInput.addEventListener('input', debouncedUpdateStatus);
  if (namesInput) namesInput.addEventListener('input', debouncedUpdateStatus);

  if (btnAddStudent) {
    btnAddStudent.addEventListener('click', () => {
      const lrnText = lrnsInput?.value || '';
      const nameText = namesInput?.value || '';
      const section = document.getElementById('cfg-student-section')?.value || '';

      if ((!lrnText.trim() && !nameText.trim()) || !section) {
        showToast('Please paste LRNs and Names and select a section.');
        return;
      }

      const parsedStudents = parseDualPasteInput(lrnText, nameText);
      if (!parsedStudents.length) {
        showToast('No valid learner entries could be parsed. Check your LRNs and Names.');
        return;
      }

      const existingLrns = new Set((currentConfig.students || []).map(student => student.lrn));
      const sectionData = (currentConfig.sections || []).find((s) => s.name === section);
      const strand = sectionData?.strand || '';
      const addedStudents = [];
      const skippedStudents = [];

      currentConfig.students = currentConfig.students || [];
      parsedStudents.forEach(({ lrn, name }) => {
        if (existingLrns.has(lrn)) {
          skippedStudents.push(lrn);
          return;
        }

        currentConfig.students.push({ lrn, name, section, strand });
        existingLrns.add(lrn);
        addedStudents.push(lrn);
      });

      if (sectionData && addedStudents.length) {
        sectionData.studentCount = Number(sectionData.studentCount || 0) + addedStudents.length;
      }

      ConfigStore.save(currentConfig);
      renderSectionOptions(currentConfig.sections);
      renderSectionsList(currentConfig.sections);
      renderStudentRegistry(currentConfig.students);

      const messageParts = [];
      if (addedStudents.length) {
        messageParts.push(`Added ${addedStudents.length} learner${addedStudents.length > 1 ? 's' : ''} to ${resolveSectionName(section, currentConfig)}.`);
      }
      if (skippedStudents.length) {
        messageParts.push(`${skippedStudents.length} duplicate LRN${skippedStudents.length > 1 ? 's' : ''} skipped.`);
      }
      showToast(messageParts.join(' '));

      if (lrnsInput) lrnsInput.value = '';
      if (namesInput) namesInput.value = '';
      updateBulkPasteStatus();
    });
  }

  // ── Section Modal Handlers ──
  const sectionModal = document.getElementById('add-section-modal');
  const btnOpenSecModal = document.getElementById('btn-open-section-modal');
  const btnCloseSecModal = document.getElementById('btn-close-section-modal');
  const btnCancelSecModal = document.getElementById('btn-cancel-section-modal');
  const btnSubmitSecModal = document.getElementById('btn-submit-section-modal');

  function openSectionModal() {
    if (!sectionModal) return;
    document.getElementById('modal-section-name').value = '';
    document.getElementById('modal-section-grade').value = '';
    document.getElementById('modal-section-strand').value = '';
    document.getElementById('modal-section-count').value = '';
    sectionModal.classList.remove('hidden');
  }

  function closeSectionModal() {
    if (sectionModal) sectionModal.classList.add('hidden');
  }

  function submitSectionModal() {
    const name = document.getElementById('modal-section-name')?.value?.trim().toUpperCase();
    const grade = document.getElementById('modal-section-grade')?.value || '';
    const strand = document.getElementById('modal-section-strand')?.value || '';
    const count = parseInt(document.getElementById('modal-section-count')?.value, 10) || 0;

    if (!name) {
      showToast('Section name is required.');
      return;
    }

    if (!grade || !strand) {
      showToast('Grade level and strand are required to register a section.');
      return;
    }

    const gradePrefix = grade === 'Grade 12' ? '12' : grade === 'Grade 11' ? '11' : '';
    const composedName = `${gradePrefix}-${strand}-${name}`;
    if (currentConfig.sections.some(s => s.name === composedName)) {
      showToast(`Section "${composedName}" already exists in registry.`);
      return;
    }

    currentConfig.sections.push({
      id: `sec-${Date.now()}`,
      name: composedName,
      grade,
      strand,
      isAdvisory: false,
      studentCount: count
    });

    ConfigStore.save(currentConfig);
    renderSectionOptions(currentConfig.sections);
    renderSectionsList(currentConfig.sections);
    closeSectionModal();
    showToast(`Registered section "${composedName}" via modal form.`);
  }

  if (btnOpenSecModal) btnOpenSecModal.addEventListener('click', openSectionModal);
  if (btnCloseSecModal) btnCloseSecModal.addEventListener('click', closeSectionModal);
  if (btnCancelSecModal) btnCancelSecModal.addEventListener('click', closeSectionModal);
  if (btnSubmitSecModal) btnSubmitSecModal.addEventListener('click', submitSectionModal);

  // Close section modal on backdrop click
  if (sectionModal) {
    sectionModal.addEventListener('click', (e) => {
      if (e.target === sectionModal) closeSectionModal();
    });
  }

  // ── Subject Modal Handlers ──
  const subjectModal = document.getElementById('add-subject-modal');
  const btnOpenSubModal = document.getElementById('btn-open-subject-modal');
  const btnCloseSubModal = document.getElementById('btn-close-subject-modal');
  const btnCancelSubModal = document.getElementById('btn-cancel-subject-modal');
  const btnSubmitSubModal = document.getElementById('btn-submit-subject-modal');

  function openSubjectModal() {
    if (!subjectModal) return;
    document.getElementById('modal-subject-title').value = '';
    document.getElementById('modal-subject-code').value = '';
    document.getElementById('modal-subject-hours').value = '40';
    document.getElementById('modal-subject-items').value = '40';
    subjectModal.classList.remove('hidden');
  }

  function closeSubjectModal() {
    if (subjectModal) subjectModal.classList.add('hidden');
  }

  function submitSubjectModal() {
    const title = document.getElementById('modal-subject-title')?.value?.trim();
    const code = document.getElementById('modal-subject-code')?.value?.trim() || `SUB-${Date.now().toString().slice(-4)}`;
    const hours = parseInt(document.getElementById('modal-subject-hours')?.value, 10) || 40;
    const items = parseInt(document.getElementById('modal-subject-items')?.value, 10) || 40;

    if (!title) {
      showToast('Subject title is required.');
      return;
    }

    if (currentConfig.subjects.some(s => s.title.toLowerCase() === title.toLowerCase())) {
      showToast(`Subject "${title}" already exists in load.`);
      return;
    }

    currentConfig.subjects.push({
      id: `sub-${Date.now()}`,
      code,
      title,
      targetHours: hours,
      targetItems: items,
      grade: 'Grade 11'
    });

    ConfigStore.save(currentConfig);
    renderSubjectsList(currentConfig.subjects);
    closeSubjectModal();
    showToast(`Registered subject "${title}" via modal form.`);
  }

  if (btnOpenSubModal) btnOpenSubModal.addEventListener('click', openSubjectModal);
  if (btnCloseSubModal) btnCloseSubModal.addEventListener('click', closeSubjectModal);
  if (btnCancelSubModal) btnCancelSubModal.addEventListener('click', closeSubjectModal);
  if (btnSubmitSubModal) btnSubmitSubModal.addEventListener('click', submitSubjectModal);

  // Close subject modal on backdrop click
  if (subjectModal) {
    subjectModal.addEventListener('click', (e) => {
      if (e.target === subjectModal) closeSubjectModal();
    });
  }

  // ARCH-001: Add delegated event listeners for dynamic lists
  addListEventListeners();
}

// ARCH-001: Refactored to use event delegation for removing items from lists.
function addListEventListeners() {
  const sectionsList = document.getElementById('cfg-sections-list');
  if (sectionsList) {
    sectionsList.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action="remove-section"]');
      if (button) removeSectionFromMasterConfig(button.dataset.id);
    });
  }

  const subjectsList = document.getElementById('cfg-subjects-list');
  if (subjectsList) {
    subjectsList.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action="remove-subject"]');
      if (button) removeSubjectFromMasterConfig(button.dataset.id);
    });
  }

  const studentsList = document.getElementById('cfg-students-list');
  if (studentsList) {
    studentsList.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action="remove-student"]');
      if (button) removeStudentFromMasterConfig(button.dataset.lrn);
    });
  }
}

function parseDualPasteInput(lrnText = '', nameText = '') {
  const lrnLines = lrnText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const nameLines = nameText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // If teacher pasted into both boxes positionally (recommended way)
  if (lrnLines.length > 0 && nameLines.length > 0) {
    const minCount = Math.min(lrnLines.length, nameLines.length);
    const results = [];

    for (let i = 0; i < minCount; i++) {
      let lrn = lrnLines[i].replace(/[^\d]/g, ''); // Extract numbers
      const name = nameLines[i];

      // Fallback if LRN text had invalid format
      if (!lrn || lrn.length < 5) {
        lrn = `10982${String(Date.now() + i).slice(-7)}`;
      }

      if (lrn && name) {
        results.push({ lrn, name });
      }
    }
    return results;
  }

  // Fallback: If teacher pasted LRN + Name together into one box
  const singleText = lrnText.trim() || nameText.trim();
  return singleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 2) return null;

      let lrn = parts[0].replace(/[^\d]/g, '');
      let name = line.slice(line.indexOf(parts[1])).trim();

      if (!lrn || lrn.length < 5) {
        const lastPart = parts[parts.length - 1].replace(/[^\d]/g, '');
        if (lastPart && lastPart.length >= 5) {
          lrn = lastPart;
          name = line.slice(0, line.lastIndexOf(parts[parts.length - 1])).trim();
        }
      }

      if (!lrn || !name) return null;
      return { lrn, name };
    })
    .filter(Boolean);
}

function renderSectionOptions(sections) {
  const targetSelector = document.getElementById('cfg-student-section');
  const filterSelector = document.getElementById('cfg-filter-student-section');

  if (targetSelector) {
    if (!sections.length) {
      targetSelector.innerHTML = `<option value="">Create a section first</option>`;
      targetSelector.disabled = true;
    } else {
      targetSelector.disabled = false;
      targetSelector.innerHTML = [
        '<option value="">Select a section...</option>',
        ...sections.map((s) => `<option value="${escapeHTML(s.name)}">${escapeHTML(resolveSectionName(s.name, { sections }))}</option>`)
      ].join('');
    }
  }

  if (filterSelector) {
    if (!sections.length) {
      filterSelector.innerHTML = `<option value="all">All Sections & Strands</option>`;
    } else {
      filterSelector.innerHTML = [
        '<option value="all">All Sections & Strands</option>',
        ...sections.map((s) => `<option value="${escapeHTML(s.name)}">${escapeHTML(resolveSectionName(s.name, { sections }))}</option>`)
      ].join('');
      filterSelector.value = activeStudentFilterSection;
    }
  }
}

function renderStudentRegistry(students = []) {
  const container = document.getElementById('cfg-students-list');
  const countBadge = document.getElementById('registered-students-count');

  const filteredStudents = students.filter((student) => {
    return activeStudentFilterSection === 'all' || student.section === activeStudentFilterSection;
  });

  if (countBadge) {
    countBadge.textContent = `${filteredStudents.length} Enrolled`;
  }
  if (!container) return;
  if (!filteredStudents.length) {
    const sectionText = activeStudentFilterSection === 'all' 
      ? 'No learners registered yet. Copy and paste LRNs and Names above to enroll learners.' 
      : `No learners enrolled in section "${resolveSectionName(activeStudentFilterSection, { sections: currentConfig.sections })}".`;
    container.innerHTML = `<p class="col-span-1 md:col-span-2 text-xs italic text-gray-400 dark:text-gray-500 py-3">${escapeHTML(sectionText)}</p>`;
    return;
  }

  container.innerHTML = filteredStudents.map((student) => {
    const sectionLabel = resolveSectionName(student.section, { sections: currentConfig.sections });
    return `
      <div class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2.5">
        <div class="space-y-0.5 text-xs min-w-0 pr-2">
          <p class="font-semibold text-gray-900 dark:text-white truncate" title="${escapeHTML(student.name)}">${escapeHTML(student.name)}</p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate">LRN: ${escapeHTML(student.lrn)} · ${escapeHTML(sectionLabel)}</p>
        </div>
        <button data-action="remove-student" data-lrn="${escapeHTML(student.lrn)}" class="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition">Remove</button>
      </div>
    `;
  }).join('');
}

function renderSectionsList(sections) {
  const container = document.getElementById('cfg-sections-list');
  if (!container) return;
  if (!sections.length) {
    container.innerHTML = `<p class="text-xs text-gray-400 italic py-2">No class sections registered.</p>`;
    return;
  }
  container.innerHTML = sections.map(s => `
    <div class="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs">
      <div class="flex items-center gap-2 min-w-0 pr-2">
        <span class="font-bold text-gray-900 dark:text-white truncate">${escapeHTML(s.name)}</span>
        <span class="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 whitespace-nowrap">${escapeHTML(s.strand)}</span>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <span class="text-gray-500 font-medium whitespace-nowrap">${s.studentCount} Students</span>
        <button data-action="remove-section" data-id="${escapeHTML(s.id)}" title="Remove Section" class="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function renderSubjectsList(subjects) {
  const container = document.getElementById('cfg-subjects-list');
  if (!container) return;
  if (!subjects.length) {
    container.innerHTML = `<p class="text-xs text-gray-400 italic py-2">No subjects assigned.</p>`;
    return;
  }
  container.innerHTML = subjects.map(s => `
    <div class="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs">
      <div class="min-w-0 pr-2">
        <p class="font-bold text-gray-900 dark:text-white truncate" title="${escapeHTML(s.title)}">${escapeHTML(s.title)}</p>
        <p class="text-[10px] text-gray-400 font-mono truncate">${escapeHTML(s.code)}</p>
      </div>
      <div class="flex items-center gap-2.5 shrink-0">
        <span class="px-2 py-1 text-[11px] font-bold rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 whitespace-nowrap shrink-0">${s.targetHours} hrs · ${s.targetItems} items</span>
        <button data-action="remove-subject" data-id="${escapeHTML(s.id)}" title="Remove Subject" class="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ARCH-001: These functions are now local to the module and called by delegated event listeners.
function removeSectionFromMasterConfig(id) {
  const currentConfig = ConfigStore.getSafe();
  const target = currentConfig.sections.find(s => s.id === id);
  if (!target) return;
  currentConfig.sections = currentConfig.sections.filter(s => s.id !== id);
  ConfigStore.save(currentConfig);
  renderSectionOptions(currentConfig.sections);
  renderSectionsList(currentConfig.sections);
  showToast(`Removed section "${target.name}" from Master Registry.`);
}

function removeSubjectFromMasterConfig(id) {
  const currentConfig = ConfigStore.getSafe();
  const target = currentConfig.subjects.find(s => s.id === id);
  if (!target) return;
  currentConfig.subjects = currentConfig.subjects.filter(s => s.id !== id);
  ConfigStore.save(currentConfig);
  renderSubjectsList(currentConfig.subjects);
  showToast(`Removed subject "${target.title}" from Master Registry.`);
}

function removeStudentFromMasterConfig(lrn) {
  if (!lrn) return;
  const currentConfig = ConfigStore.getSafe();
  const target = currentConfig.students.find((student) => student.lrn === lrn);
  if (!target) return;
  currentConfig.students = currentConfig.students.filter((student) => student.lrn !== lrn);
  ConfigStore.save(currentConfig);
  renderStudentRegistry(currentConfig.students);
  showToast(`Removed learner "${target.name}" from enrollment registry.`);
}

function showToast(msg) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  toast.innerHTML = `<span>${msg}</span>`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
