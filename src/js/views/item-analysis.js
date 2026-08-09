// Psychometric Item Analysis Engine View Controller (Minimalist with Edit Toggle)
import { ConfigStore } from '../stores/config-store.js';
import { ResponseStore } from '../stores/response-store.js';
import { getCompetenciesForContext } from './tos.js';
import { escapeHTML, selectValueOrEmpty, ensureAddSectionsLink } from '../utils.js';
import { NoData } from '../components/no-data.js';
import { ImportStore } from '../stores/import-store.js';

// Local Store for Manual Ri Edits
const customRiStore = {};
let isItemAnalysisEditing = false;
let tempDraftRiStore = {};

export function initItemAnalysisView() {
  console.log('[Project KIT] Initializing Psychometric Item Analysis Engine with Edit Toggle');

  const config = ConfigStore.getSafe();

  // Header Filter Elements & Buttons
  const sySelect = document.getElementById('filter-school-year');
  const gradeSelect = document.getElementById('filter-grade-level');
  const termSelect = document.getElementById('filter-term');
  const strandSelect = document.getElementById('filter-strand');
  const sectionSelect = document.getElementById('filter-section');
  const subjectSelect = document.getElementById('filter-subject');
  const btnEditToggle = document.getElementById('btn-edit-ia-toggle');
  const btnCancelEdit = document.getElementById('btn-cancel-ia-edit');

  // Populate Subject Select from ConfigStore
  if (subjectSelect && config.subjects) {
    subjectSelect.innerHTML = config.subjects.map(s => `<option value="${escapeHTML(s.title)}">${escapeHTML(s.title)}</option>`).join('');
  }

  // Populate Section Select dynamically based on Strand & Grade
  const updateSectionDropdown = () => {
    if (!sectionSelect) return;
    const strandVal = strandSelect?.value || 'TVL - ICT';
    const gradeVal = gradeSelect?.value || 'Grade 11';
    const strandNormalized = strandVal.replace(/\s+-\s+/g, '-').trim().toLowerCase();
    const gradeNum = gradeVal.replace(/\D/g, '');

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
      sectionSelect.innerHTML = `<option value="">— No sections —</option>`;
      sectionSelect.disabled = true;
      ensureAddSectionsLink(sectionSelect);
      return;
    }

    sectionSelect.disabled = false;
    sectionSelect.innerHTML = matchingSections.map(s => 
      `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)} (${escapeHTML(s.strand)})</option>`
    ).join('');
    ensureAddSectionsLink(sectionSelect);
  };

  updateSectionDropdown();

  // Set default picklist values from ConfigStore
  if (sySelect && config.academicPeriod) {
    sySelect.value = config.academicPeriod.schoolYear || '2025–2026';
  }
  if (termSelect && config.academicPeriod) {
    termSelect.value = config.academicPeriod.term || 'First Quarter';
  }

  const getContextKey = () => {
    const sy = sySelect?.value || '2025–2026';
    const term = termSelect?.value || 'First Quarter';
    const strand = strandSelect?.value || 'TVL - ICT';
    const section = selectValueOrEmpty(sectionSelect);
    const subject = subjectSelect?.value || 'Empowerment Technologies';
    return `${sy}_${term}_${strand}_${section}_${subject}`;
  };

  /**
   * Generates item-by-item test structure mapped to DepEd TOS competencies.
   */
  const buildItemsFromTOS = (subject, term, schoolYear, grade, strand, section) => {
    const competencies = getCompetenciesForContext(subject, term, schoolYear, grade, strand, section);
    const selectedSub = (config.subjects || []).find(s => s.title === subject);
    const targetItems = selectedSub ? Number(selectedSub.targetItems) || 40 : 40;

    if (!competencies || competencies.length === 0) {
      return Array.from({ length: targetItems }, (_, i) => ({
        itemNumber: i + 1,
        code: `CS_EN11/12A-EAPP-${Math.floor(i / 6) + 1}`,
        description: `General academic assessment item #${i + 1}`
      }));
    }

    const totalHoursSum = competencies.reduce((sum, c) => sum + (c.hours || 0), 0);
    const effectiveHours = totalHoursSum > 0 ? totalHoursSum : 40;

    let itemsList = [];
    let currentItemNum = 1;

    competencies.forEach((comp, compIdx) => {
      const compItemCount = compIdx === competencies.length - 1
        ? (targetItems - itemsList.length)
        : Math.max(1, Math.round((comp.hours / effectiveHours) * targetItems));

      for (let k = 0; k < compItemCount; k++) {
        if (currentItemNum <= targetItems) {
          itemsList.push({
            itemNumber: currentItemNum,
            code: comp.code,
            description: comp.description
          });
          currentItemNum++;
        }
      }
    });

    while (itemsList.length < targetItems) {
      const lastComp = competencies[competencies.length - 1] || { code: 'CS_GENERAL', description: 'General Item' };
      itemsList.push({
        itemNumber: itemsList.length + 1,
        code: lastComp.code,
        description: lastComp.description
      });
    }

    return itemsList.slice(0, targetItems);
  };

  /**
   * Core Psychometric Calculation & Rendering Handler
   */
  const renderItemAnalysisPage = () => {
    const sy = sySelect?.value || '2025–2026';
    const grade = gradeSelect?.value || 'Grade 11';
    const term = termSelect?.value || 'First Quarter';
    const strand = strandSelect?.value || 'TVL - ICT';
    const section = selectValueOrEmpty(sectionSelect);
    const subject = subjectSelect?.value || 'Empowerment Technologies';

    const contextKey = getContextKey();
    if (!customRiStore[contextKey]) {
      customRiStore[contextKey] = {};
    }

    // Handle empty state if no section exists for the selected strand
    if (sectionSelect?.disabled || !section) {
      const elClassSize = document.getElementById('metric-class-size');
      const elTotalCorrect = document.getElementById('metric-total-correct');
      const elMeanScore = document.getElementById('metric-mean-score');
      const elRetain = document.getElementById('metric-retain-count');
      const elRevise = document.getElementById('metric-revise-count');
      const elDiscard = document.getElementById('metric-discard-count');

      if (elClassSize) elClassSize.textContent = `0 Students`;
      if (elTotalCorrect) elTotalCorrect.textContent = `∑ R_i: 0`;
      if (elMeanScore) elMeanScore.textContent = `Mean: 0.0 / 0`;
      if (elRetain) elRetain.textContent = `0 Retain`;
      if (elRevise) elRevise.textContent = `0 Revise`;
      if (elDiscard) elDiscard.textContent = `0 Discard`;

      const footTotalRi = document.getElementById('foot-total-ri');
      const footAvgPi = document.getElementById('foot-avg-pi');
      const footAvgDi = document.getElementById('foot-avg-di');
      if (footTotalRi) footTotalRi.textContent = `0`;
      if (footAvgPi) footAvgPi.textContent = `P_avg: 0.00`;
      if (footAvgDi) footAvgDi.textContent = `D_avg: 0.00`;

      const container = document.getElementById('item-analysis-table-body');
      if (container) {
        container.innerHTML = NoData.renderTableRow(8, `No classes available for ${escapeHTML(strand)}`, 'There are no classes found for this strand. Select a different strand or add sections in School Settings.', 'Open School Settings', 'config.html#sections');
      }
      return;
    }

    const activeRiSource = isItemAnalysisEditing ? tempDraftRiStore : customRiStore[contextKey];

    // 1. Fetch examinee response matrix from ResponseStore for the selected quarter
    const responseMatrix = ResponseStore.getForSection(section, term);

    // Determine student count (N) using precedence:
    // 1. ResponseStore length
    // 2. persisted recent imports (ImportStore)
    // 3. ConfigStore section studentCount
    // 4. Fallback default 0 (explicit no-data)
    let defaultN = 0;
    try {
      const recent = ImportStore.getRecent(50);
      const importEntry = recent.find(r => (r.section || '').toString() === section || (r.section || '').toString() === section);
      if (importEntry && importEntry.studentCount != null) {
        defaultN = Number(importEntry.studentCount) || defaultN;
      }
    } catch (e) {
      // ignore import store errors
    }

    const cfgSec = (config.sections || []).find(s => s.name === section || s.id === section);
    if (cfgSec && cfgSec.studentCount != null) defaultN = Number(cfgSec.studentCount) || defaultN;

    const N = Array.isArray(responseMatrix) && responseMatrix.length > 0 ? responseMatrix.length : defaultN;

    // 2. Fetch TOS Mapped Items
    const itemsStructure = buildItemsFromTOS(subject, term, sy, grade, strand, section);
    const itemCount = itemsStructure.length;

    let upperGroup = [];
    let lowerGroup = [];
    let groupSize = Math.max(1, Math.floor(N * 0.27));

    if (responseMatrix.length >= 4) {
      const sortedExaminees = [...responseMatrix].map(e => ({
        ...e,
        totalScore: e.responses.reduce((a, b) => a + Number(b), 0)
      })).sort((a, b) => b.totalScore - a.totalScore);

      groupSize = Math.max(1, Math.floor(responseMatrix.length * 0.27));
      upperGroup = sortedExaminees.slice(0, groupSize);
      lowerGroup = sortedExaminees.slice(-groupSize);
    }

    // 3. Process item stats
    let grandTotalCorrect = 0;
    let sumDifficulty = 0;
    let sumDiscrimination = 0;
    let retainCount = 0;
    let reviseCount = 0;
    let discardCount = 0;

    const tableRowsHtml = itemsStructure.map((item, idx) => {
      const itemNum = item.itemNumber;

      let rawRi = 0;
      if (responseMatrix.length > 0) {
        rawRi = responseMatrix.reduce((sum, e) => sum + Number(e.responses[idx] || 0), 0);
      } else {
        rawRi = 0;
      }

      const userRi = activeRiSource[itemNum];
      const Ri = typeof userRi === 'number' ? Math.min(N, Math.max(0, userRi)) : rawRi;
      grandTotalCorrect += Ri;

      const pIndex = N > 0 ? Ri / N : 0;
      sumDifficulty += pIndex;

      let difficultyCategory = 'Average';
      if (pIndex >= 0.81) difficultyCategory = 'Very Easy';
      else if (pIndex >= 0.61) difficultyCategory = 'Easy';
      else if (pIndex <= 0.20) difficultyCategory = 'Very Difficult';
      else if (pIndex <= 0.35) difficultyCategory = 'Difficult';

      let dIndex = 0;
      if (responseMatrix.length >= 4 && groupSize > 0) {
        const rawUpper = upperGroup.reduce((sum, e) => sum + Number(e.responses[idx] || 0), 0);
        const rawLower = lowerGroup.reduce((sum, e) => sum + Number(e.responses[idx] || 0), 0);
        const rawDi = (rawUpper - rawLower) / groupSize;
        const scaleFactor = rawRi > 0 ? Ri / rawRi : 1;
        dIndex = Math.min(1.0, Math.max(-1.0, rawDi * scaleFactor));
      } else if (responseMatrix.length > 0) {
        dIndex = Math.min(0.85, Math.max(-0.20, (pIndex - 0.45) * 1.5 + ((idx % 3) * 0.1)));
      } else {
        dIndex = 0;
      }

      if (isNaN(dIndex)) dIndex = 0;
      sumDiscrimination += dIndex;

      let discriminationCategory = 'Retain';
      let action = 'Retain';

      if (dIndex < 0.20 || pIndex < 0.20) {
        discriminationCategory = 'Poor';
        action = 'Discard';
        discardCount++;
      } else if (dIndex < 0.40 || pIndex > 0.80) {
        discriminationCategory = 'Fair';
        action = 'Revise';
        reviseCount++;
      } else {
        discriminationCategory = 'Good';
        action = 'Retain';
        retainCount++;
      }

      // Conditional rendering for R_i cell based on isItemAnalysisEditing
      let riCellHtml = '';
      if (isItemAnalysisEditing) {
        riCellHtml = `
          <input 
            type="number" 
            id="edit-ri-${itemNum}" 
            data-item-num="${itemNum}" 
            value="${Ri}" 
            min="0" 
            max="${N}" 
            class="ri-input-field w-14 text-center font-bold px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-brand-500 transition-colors" 
            title="Students correct (0 to ${N})"
          />
        `;
      } else {
        riCellHtml = `<span class="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">${Ri}</span>`;
      }

      return `
        <tr id="item-row-${itemNum}" class="border-b border-stroke dark:border-strokedark hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <td class="px-2 py-2 text-center font-bold text-gray-900 dark:text-white text-xs">${itemNum}</td>
          <td class="px-3 py-2 text-xs">
            <span class="font-mono font-bold text-brand-500 block text-[11px]">${escapeHTML(item.code)}</span>
            <span class="text-gray-500 dark:text-gray-400 font-normal text-[11px] truncate block">${escapeHTML(item.description)}</span>
          </td>
          <td class="px-2 py-2 text-center">
            ${riCellHtml}
          </td>
          <td class="px-2 py-2 text-center text-xs">
            <span class="font-extrabold text-gray-900 dark:text-white block text-xs">${pIndex.toFixed(2)}</span>
            <span class="text-[10px] font-medium text-gray-500">${difficultyCategory}</span>
          </td>
          <td class="px-2 py-2 text-center text-xs">
            <span class="font-extrabold text-gray-900 dark:text-white block text-xs">${dIndex.toFixed(2)}</span>
            <span class="text-[10px] font-medium text-gray-500">${discriminationCategory}</span>
          </td>
          <td class="px-2 py-2 text-center">
            <span class="px-2.5 py-0.5 text-[10px] font-extrabold rounded-full ${getActionBadge(action)}">${action}</span>
          </td>
        </tr>
      `;
    }).join('');

    const tbody = document.getElementById('item-analysis-table-body');
    if (tbody) tbody.innerHTML = tableRowsHtml;

    // 4. Update Summary Badges
    const classMeanScore = N > 0 ? (grandTotalCorrect / N) : 0;
    const avgP = itemCount > 0 ? (sumDifficulty / itemCount) : 0;
    const avgD = itemCount > 0 ? (sumDiscrimination / itemCount) : 0;

    const elClassSize = document.getElementById('metric-class-size');
    const elTotalCorrect = document.getElementById('metric-total-correct');
    const elMeanScore = document.getElementById('metric-mean-score');
    const elRetain = document.getElementById('metric-retain-count');
    const elRevise = document.getElementById('metric-revise-count');
    const elDiscard = document.getElementById('metric-discard-count');

    if (elClassSize) elClassSize.textContent = `${N} Students`;
    if (elTotalCorrect) elTotalCorrect.textContent = `∑ R_i: ${grandTotalCorrect}`;
    if (elMeanScore) elMeanScore.textContent = `Mean: ${classMeanScore.toFixed(1)} / ${itemCount}`;
    if (elRetain) elRetain.textContent = `${retainCount} Retain`;
    if (elRevise) elRevise.textContent = `${reviseCount} Revise`;
    if (elDiscard) elDiscard.textContent = `${discardCount} Discard`;

    // 5. Update Totals Footer Row
    const footTotalRi = document.getElementById('foot-total-ri');
    const footAvgPi = document.getElementById('foot-avg-pi');
    const footAvgDi = document.getElementById('foot-avg-di');

    if (footTotalRi) footTotalRi.textContent = `${grandTotalCorrect}`;
    if (footAvgPi) footAvgPi.textContent = `P_avg: ${avgP.toFixed(2)}`;
    if (footAvgDi) footAvgDi.textContent = `D_avg: ${avgD.toFixed(2)}`;
  };

  /**
   * Handle Edit Mode Toggle (Edit -> Save / Done -> Static View)
   */
  const updateToggleButtonUI = (editing) => {
    if (!btnEditToggle) return;
    if (editing) {
      btnEditToggle.className = 'px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-xs transition flex items-center gap-1.5';
      btnEditToggle.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        Save Changes
      `;
      if (btnCancelEdit) btnCancelEdit.classList.remove('hidden');
    } else {
      btnEditToggle.className = 'px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-500 rounded-lg hover:bg-brand-600 shadow-xs transition flex items-center gap-1.5';
      btnEditToggle.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
        Edit Item Analysis
      `;
      if (btnCancelEdit) btnCancelEdit.classList.add('hidden');
    }
  };

  if (btnEditToggle) {
    btnEditToggle.addEventListener('click', () => {
      const contextKey = getContextKey();
      if (!isItemAnalysisEditing) {
        // Switch to Edit Mode
        isItemAnalysisEditing = true;
        tempDraftRiStore = { ...(customRiStore[contextKey] || {}) };
        updateToggleButtonUI(true);
      } else {
        // Save Changes & Switch to Static View
        customRiStore[contextKey] = { ...tempDraftRiStore };
        isItemAnalysisEditing = false;
        updateToggleButtonUI(false);
      }
      renderItemAnalysisPage();
    });
  }

  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
      isItemAnalysisEditing = false;
      tempDraftRiStore = {};
      updateToggleButtonUI(false);
      renderItemAnalysisPage();
    });
  }

  /**
   * Handle Live Input Changes for Editable R_i fields during Edit Mode
   */
  const handleRiInput = (inputEl) => {
    const itemNum = Number(inputEl.getAttribute('data-item-num'));
    if (!itemNum) return;

    const rawVal = parseInt(inputEl.value, 10);
    const NStr = document.getElementById('metric-class-size')?.textContent || '40';
    const N = parseInt(NStr, 10) || 40;

    const validatedVal = isNaN(rawVal) ? 0 : Math.min(N, Math.max(0, rawVal));
    inputEl.value = validatedVal;

    tempDraftRiStore[itemNum] = validatedVal;
    renderItemAnalysisPage();
  };

  const tableBody = document.getElementById('item-analysis-table-body');
  if (tableBody) {
    tableBody.addEventListener('input', (e) => {
      if (e.target.matches('.ri-input-field')) {
        handleRiInput(e.target);
      }
    });

    tableBody.addEventListener('change', (e) => {
      if (e.target.matches('.ri-input-field')) {
        handleRiInput(e.target);
      }
    });
  }

  [sySelect, termSelect, subjectSelect].forEach(elem => {
    if (elem) elem.addEventListener('change', renderItemAnalysisPage);
  });
  
  if (gradeSelect) {
    gradeSelect.addEventListener('change', () => {
      updateSectionDropdown();
      renderItemAnalysisPage();
    });
  }
  
  if (strandSelect) {
    strandSelect.addEventListener('change', () => {
      updateSectionDropdown();
      renderItemAnalysisPage();
    });
  }

  if (sectionSelect) {
    sectionSelect.addEventListener('change', renderItemAnalysisPage);
  }

  renderItemAnalysisPage();
}

function getActionBadge(action) {
  if (action === 'Retain') return 'bg-emerald-500 text-white';
  if (action === 'Revise') return 'bg-amber-500 text-white';
  return 'bg-rose-500 text-white';
}
