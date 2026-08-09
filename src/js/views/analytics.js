// Performance Analytics View Script with Class vs Year Comparison & Context Dropdowns
import ApexCharts from 'apexcharts';
import { ConfigStore } from '../stores/config-store.js';
import { ResponseStore } from '../stores/response-store.js';
import { ImportStore } from '../stores/import-store.js';
import { AppSettingsStore } from '../stores/app-settings-store.js';
import { SkeletonBuilder } from '../skeletons.js';
import { getCompetenciesForContext } from './tos.js';
import { escapeHTML, selectValueOrEmpty, ensureAddSectionsLink } from '../utils.js';
import { NoData } from '../components/no-data.js';

function cssVar(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch(e){ return fallback; }
}

let activeChart = null;
let activeScope = 'class'; // 'class' or 'year'
let activeTab = 'sectional';

function getTargetItemCount(subject) {
  const config = ConfigStore.getSafe();
  const selectedSubject = (config.subjects || []).find(s => s.title === subject);
  return selectedSubject ? Number(selectedSubject.targetItems) || 40 : 40;
}

function getDifficultyCurveData(section, term, subject) {
  const responses = ResponseStore.getForSection(section, term) || [];
  const itemCount = Array.isArray(responses[0]?.responses) ? responses[0].responses.length : getTargetItemCount(subject);
  const categories = Array.from({ length: itemCount }, (_, idx) => `Item ${idx + 1}`);

  if (!Array.isArray(responses) || responses.length === 0 || itemCount === 0) {
    return { categories, data: [] };
  }

  const totalStudents = responses.length;
  const data = Array.from({ length: itemCount }, (_, itemIndex) => {
    const correctCount = responses.reduce((sum, response) => sum + (Number(response.responses?.[itemIndex]) || 0), 0);
    return Number((totalStudents > 0 ? correctCount / totalStudents : 0).toFixed(2));
  });

  return { categories, data };
}

export function initAnalyticsView() {
  console.log('[Project KIT] Initializing Performance Analytics Dashboard with Class vs Year Comparison');

  const config = ConfigStore.getSafe();

  // Picklists & Control Elements
  const sySelect = document.getElementById('filter-school-year');
  const gradeSelect = document.getElementById('filter-grade-level');
  const termSelect = document.getElementById('filter-term');
  const strandSelect = document.getElementById('filter-strand');
  const sectionSelect = document.getElementById('filter-section');
  const subjectSelect = document.getElementById('filter-subject');

  const tabButtons = document.querySelectorAll('#analytics-tabs-nav .tab-btn');
  const contentContainer = document.getElementById('analytics-tab-content');

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

  // Scope is now derived from the active tab (sectional => 'class', longitudinal => 'year'). The explicit scope switcher buttons were removed to simplify the UI.

  const updateTabButtonsUI = () => {
    tabButtons.forEach(b => {
      if (b.dataset.tab === activeTab) {
        b.classList.remove('border-transparent', 'text-gray-500', 'font-medium');
        b.classList.add('border-brand-500', 'text-brand-500', 'font-semibold');
      } else {
        b.classList.remove('border-brand-500', 'text-brand-500', 'font-semibold');
        b.classList.add('border-transparent', 'text-gray-500', 'font-medium');
      }
    });
  };

  // Tab Navigation Listeners
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeTab = e.currentTarget.dataset.tab;
      updateTabButtonsUI();
      refreshAnalyticsDisplay();
    });
  });

  // Picklist Change Listeners
  [sySelect, termSelect, subjectSelect, sectionSelect].forEach(elem => {
    if (elem) elem.addEventListener('change', () => refreshAnalyticsDisplay());
  });
  
  if (gradeSelect) {
    gradeSelect.addEventListener('change', () => {
      updateSectionDropdown();
      refreshAnalyticsDisplay();
    });
  }
  
  if (strandSelect) {
    strandSelect.addEventListener('change', () => {
      updateSectionDropdown();
      refreshAnalyticsDisplay();
    });
  }

  /**
   * Main Refresh Function: Renders Skeletons + Charts
   */
  function refreshAnalyticsDisplay() {
    if (!contentContainer) return;

    // Render Skeleton Loader
    contentContainer.innerHTML = SkeletonBuilder.renderChartPlaceholder(`Loading ${activeScope.toUpperCase()} ${activeTab.toUpperCase()} Analytics...`);

    // Update Summary Header Pills
    const sectionVal = selectValueOrEmpty(sectionSelect);
    const syVal = sySelect?.value || '2025–2026';
    const qtrVal = termSelect?.value || 'First Quarter';
    const strandVal = strandSelect?.value || 'TVL - ICT';
 
    const elScopeTag = document.getElementById('metric-scope-tag');
    const elMpsScore = document.getElementById('metric-mps-score');
    const elMasteryTag = document.getElementById('metric-mastery-tag');

    // Derive scope from activeTab for simplicity (sectional => class, longitudinal => year)
    activeScope = activeTab === 'longitudinal' ? 'year' : 'class';

    if (sectionSelect?.disabled || !sectionVal) {
      if (elScopeTag) elScopeTag.textContent = `No Section (${strandVal})`;
      if (elMpsScore) elMpsScore.textContent = `Mean MPS: N/A`;
      if (elMasteryTag) elMasteryTag.textContent = `Mastery: N/A`;
    } else {
      if (elScopeTag) {
        elScopeTag.textContent = activeScope === 'class' 
          ? `Class Scope: ${sectionVal}` 
          : `Longitudinal Scope: ${syVal} (${strandVal})`;
      }
      // Compute section-level MPS using real response data when available; otherwise prefer persisted imports/ConfigStore
      let computedMps = null;

      if (activeScope === 'class') {
        if (sectionVal) {
          // Try to compute from ResponseStore if responses exist for this section
          const responses = ResponseStore.getForSection(sectionVal, qtrVal) || [];
          if (Array.isArray(responses) && responses.length > 0) {
            // Determine number of items from first student's response array
            const items = Array.isArray(responses[0].responses) ? responses[0].responses.length : 0;
            if (items > 0) {
              // Sum correct answers across all students
              const totalCorrect = responses.reduce((acc, s) => {
                const sum = Array.isArray(s.responses) ? s.responses.reduce((a, v) => a + (Number(v) || 0), 0) : 0;
                return acc + sum;
              }, 0);
              const denom = responses.length * items;
              computedMps = denom > 0 ? Number(((totalCorrect / denom) * 100).toFixed(1)) : 0;
            }
          }

          // Fallback: try persisted imports -> ConfigStore. Do NOT fall back to hardcoded mock data.
          if (computedMps == null) {
            // recent imports (persisted)
            let parsedImportMps = null;
            try {
              const recent = ImportStore.getRecent(20);
              const importEntry = recent.find(r => (r.section || '').toString() === sectionVal || (r.section || '').toString() === sectionVal);
              if (importEntry && importEntry.mps != null) {
                if (typeof importEntry.mps === 'string') {
                  const n = parseFloat(importEntry.mps.replace('%','').trim());
                  parsedImportMps = Number.isFinite(n) ? n : null;
                } else if (typeof importEntry.mps === 'number') {
                  parsedImportMps = importEntry.mps;
                }
              }
            } catch (e) {
              // ignore import store errors
            }

            // Check ConfigStore for per-section mps if present
            const cfg = ConfigStore.getSafe();
            const cfgSec = (cfg.sections || []).find(s=>s.name === sectionVal || s.id === sectionVal);
            const cfgMps = (cfgSec && cfgSec.mps != null) ? Number(cfgSec.mps) : null;

            // Do not use mock system average; if none available, mark as null so UI shows N/A
            computedMps = parsedImportMps ?? cfgMps ?? null;
          }
        } else {
          computedMps = null;
        }
      } else {
        // For longitudinal (year) scope, try to use imports / ConfigStore per year aggregation if applicable
        computedMps = null;
      }
      if (computedMps != null) {
        if (elMpsScore) elMpsScore.textContent = `Mean MPS: ${computedMps}%`;
        if (elMasteryTag) elMasteryTag.textContent = computedMps >= AppSettingsStore.mpsPassing() ? 'Mastery: High' : 'Mastery: Moderate';
      } else {
        if (elMpsScore) elMpsScore.textContent = `Mean MPS: N/A`;
        if (elMasteryTag) elMasteryTag.textContent = `Mastery: N/A`;
      }
    }

    // Render Tab Content & ApexChart after brief transition
    setTimeout(() => {
      switchTabContent(activeTab, contentContainer, {
        scope: activeScope,
        schoolYear: syVal,
        section: sectionVal,
        strand: strandVal,
        subject: subjectSelect?.value || 'Empowerment Technologies',
        quarter: termSelect?.value || 'First Quarter'
      });
    }, 200);
  }

  // Initial Load
  refreshAnalyticsDisplay();
}

function switchTabContent(tabName, container, context) {
  if (activeChart) {
    try { activeChart.destroy(); } catch (e) {}
    activeChart = null;
  }

  if (document.getElementById('filter-section')?.disabled || !context.section) {
    container.innerHTML = NoData.renderCard(`No Classes Available for ${escapeHTML(context.strand)}`, 'There are currently no classes configured for this strand. Please select another strand from the dropdown or add new classes in School Settings.', 'Open School Settings', 'config.html#sections');
    return;
  }

  if (tabName === 'sectional') {
    container.innerHTML = `
      <div class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white">Class Sectional Achievement Comparison (MPS %)</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Mean Percentage Scores across tracked academic classes in ${escapeHTML(context.strand)}</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Target Benchmark: ${Number(AppSettingsStore.mpsPassing()).toFixed(1)}% MPS
          </span>
        </div>
        <div id="analytics-chart-canvas" class="w-full h-72"></div>
      </div>
    `;
    renderSectionalChart('#analytics-chart-canvas', context);
  } else if (tabName === 'longitudinal') {
    container.innerHTML = `
      <div class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white">Year-over-Year Longitudinal MPS Growth Trends</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Multi-year academic achievement trajectory across school years (2024–2027)</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
            Cohort Growth: +5.4%
          </span>
        </div>
        <div id="analytics-chart-canvas" class="w-full h-72"></div>
      </div>
    `;
    renderLongitudinalChart('#analytics-chart-canvas', context);
  } else if (tabName === 'cognitive') {
    container.innerHTML = `
      <div class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white">Cognitive Domain Mastery Distribution</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Comparison of item allocation and student mastery across Bloom's 6 cognitive dimensions</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            Subject: ${escapeHTML(context.subject)}
          </span>
        </div>
        <div id="analytics-chart-canvas" class="w-full h-72"></div>
      </div>
    `;
    renderCognitiveChart('#analytics-chart-canvas', context);
  } else if (tabName === 'difficulty') {
    container.innerHTML = `
      <div class="p-5 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white">Psychometric Item Difficulty Curve (P_i)</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Distribution of item difficulty indices across the selected section and quarter</p>
          </div>
          <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Ideal Range: 0.36 - 0.80
          </span>
        </div>
        <div id="analytics-chart-canvas" class="w-full h-72"></div>
      </div>
    `;
    renderDifficultyCurve('#analytics-chart-canvas', context);
  }
}

function renderSectionalChart(selector, context) {
  const container = document.querySelector(selector);
  if (!container) return;

  // Build sections list from ConfigStore (this matches the picklist values) and attach any matching mock section metadata
  const cfg = ConfigStore.getSafe();
  const cfgSections = cfg.sections || [];
  // No mock lookup: we intentionally avoid using hardcoded mock metadata here
  const findMockSection = () => undefined;

  const sections = cfgSections.map(s => ({
  id: s.id || s.name,
  name: s.name,
  strand: s.strand,
  studentCount: s.studentCount
  }));

  // Build an ordered small set for the chart: active section first (if present) then others
  let ordered = [];
  if (context.section) {
    const active = sections.find(s => s.name === context.section);
    if (active) ordered.push(active);
    ordered = ordered.concat(sections.filter(s => s.name !== context.section));
  } else {
    ordered = sections.slice();
  }

  // Limit to 4 items for display parity with previous implementation
  ordered = ordered.slice(0, 4);

  const categories = ordered.map(s => `${s.name}${s.name === context.section ? ' (Active)' : ''}`);
  const data = ordered.map(s => {
    // Prefer real response-derived MPS when available for each section and current quarter
    try {
      const responses = ResponseStore.getForSection(s.name, context.quarter) || [];
      if (Array.isArray(responses) && responses.length > 0) {
        const items = Array.isArray(responses[0].responses) ? responses[0].responses.length : 0;
        if (items > 0) {
          const totalCorrect = responses.reduce((acc, st) => {
            const sum = Array.isArray(st.responses) ? st.responses.reduce((a, v) => a + (Number(v) || 0), 0) : 0;
            return acc + sum;
          }, 0);
          const denom = responses.length * items;
          return Number(((totalCorrect / denom) * 100).toFixed(1));
        }
      }
    } catch (e) {
      // ignore and fallback
    }
    // Try persisted recent imports and ConfigStore; do not use mock data
    let fallbackMps = null;
    try {
      const recent = ImportStore.getRecent(20);
      const importEntry = recent.find(r => (r.section || '').toString() === s.name || (r.section || '').toString() === s.name);
      if (importEntry && importEntry.mps != null) {
        if (typeof importEntry.mps === 'string') {
          const n = parseFloat(importEntry.mps.replace('%','').trim());
          fallbackMps = Number.isFinite(n) ? n : null;
        } else if (typeof importEntry.mps === 'number') {
          fallbackMps = importEntry.mps;
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      const cfg = ConfigStore.getSafe();
      const cfgSec = (cfg.sections || []).find(x => x.name === s.name || x.id === s.id);
      if (cfgSec && cfgSec.mps != null) fallbackMps = Number(cfgSec.mps);
    } catch (e) {}

    // If still no data, return null so chart can show a gap and UI will indicate no data
    return fallbackMps ?? null;
  });

  const options = {
    chart: { type: 'bar', height: 280, toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '45%', borderRadius: 4 } },
    colors: [ cssVar('--color-success-500', '#10B981') ],
    series: [{ name: 'Class MPS %', data }],
    xaxis: { categories, max: 100 }
  };
  activeChart = new ApexCharts(container, options);
  activeChart.render();
}

function renderLongitudinalChart(selector, context) {
  const container = document.querySelector(selector);
  if (!container) return;

  const quarters = ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter'];
  // Years to display across the longitudinal chart (inclusive)
  const years = ['2024–2025', '2025–2026', '2026–2027'];

  const importEntries = (() => {
    try { return ImportStore.get(); } catch (e) { return []; }
  })();

  const cfg = ConfigStore.getSafe();
  const currentSchoolYear = cfg.academicPeriod?.schoolYear || null;

  function findImportMps(sectionName, schoolYear, quarter) {
    if (!sectionName || !schoolYear || !quarter) return null;
    const candidate = importEntries.find(e => {
      if (!e) return false;
      const sec = (e.section || '').toString();
      const sy = (e.schoolYear || e.school_year || '').toString();
      const q = (e.quarter || '').toString();
      return sec === sectionName && sy === schoolYear && ResponseStore.normalizeQuarterName(q) === ResponseStore.normalizeQuarterName(quarter);
    });
    if (!candidate || candidate.mps == null) return null;
    if (typeof candidate.mps === 'string') {
      const n = parseFloat(candidate.mps.replace('%','').trim());
      return Number.isFinite(n) ? n : null;
    }
    if (typeof candidate.mps === 'number') return candidate.mps;
    return null;
  }

  function computeMpsFromResponses(sectionName, quarter) {
    try {
      const responses = ResponseStore.getForSection(sectionName, quarter) || [];
      if (!Array.isArray(responses) || responses.length === 0) return null;
      const items = Array.isArray(responses[0].responses) ? responses[0].responses.length : 0;
      if (items === 0) return null;
      const totalCorrect = responses.reduce((acc, st) => {
        if (!Array.isArray(st.responses)) return acc;
        return acc + st.responses.reduce((a, v) => a + (Number(v) || 0), 0);
      }, 0);
      const denom = responses.length * items;
      return denom > 0 ? Number(((totalCorrect / denom) * 100).toFixed(1)) : null;
    } catch (e) {
      return null;
    }
  }

  const series = years.map((sy, idx) => {
    const data = quarters.map(q => {
      // 1) Prefer ImportStore entries that include schoolYear and quarter
      const fromImport = findImportMps(context.section, sy, q);
      if (fromImport != null) return fromImport;

      // 2) If schoolYear is current school year, prefer live ResponseStore
      if (sy === currentSchoolYear) {
        const respMps = computeMpsFromResponses(context.section, q);
        if (respMps != null) return respMps;
      }

      // 3) Try fallback: if imports exist without schoolYear (legacy), attempt match by quarter+section
      const legacy = importEntries.find(e => (e.section || '').toString() === (context.section || '').toString() && ResponseStore.normalizeQuarterName(e.quarter || '') === ResponseStore.normalizeQuarterName(q));
      if (legacy && legacy.mps != null) {
        const v = typeof legacy.mps === 'string' ? parseFloat(legacy.mps.replace('%','').trim()) : Number(legacy.mps);
        if (Number.isFinite(v)) return v;
      }

      // 4) No data available for this (sy,q) -> return null to create gaps in the chart
      return null;
    });

    return { name: `S.Y. ${sy} MPS %`, data };
  });

  const options = {
    chart: { type: 'line', height: 280, toolbar: { show: false } },
    stroke: { curve: 'smooth', width: 3 },
    colors: [ cssVar('--color-brand-500', '#3C50E0'), cssVar('--color-success-500', '#10B981'), cssVar('--color-warning-500', '#F59E0B') ],
    series,
    xaxis: { categories: ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'] },
    yaxis: { min: 0, max: 100 }
  };

  activeChart = new ApexCharts(container, options);
  activeChart.render();
}

function renderCognitiveChart(selector, context) {
  const container = document.querySelector(selector);
  if (!container) return;

  const domains = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  const domainLabels = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];

  const subject = context.subject || 'Empowerment Technologies';
  const quarter = context.quarter || 'First Quarter';
  const cfg = ConfigStore.getSafe();
  const sectionMeta = (cfg.sections || []).find(s => s.name === context.section || s.id === context.section);
  const grade = sectionMeta?.grade || 'Grade 11';
  const schoolYear = context.schoolYear || cfg.academicPeriod?.schoolYear || '2025–2026';
  const strand = context.strand || 'TVL - ICT';

  const competencies = getCompetenciesForContext(subject, quarter, schoolYear, grade, strand, context.section);
  if (!competencies || competencies.length === 0) {
    container.innerHTML = NoData.renderCard('No cognitive domain mapping available', 'There are no TOS competencies mapped for the selected subject and quarter. Adjust your selection or add competencies in the TOS page.', 'Open TOS Competencies', '/tos.html');
    return;
  }

  const targetItemsByDomain = domains.map(domain =>
    competencies.reduce((sum, comp) => sum + (Number(comp.domains?.[domain]) || 0), 0)
  );

  const domainSequence = [];
  competencies.forEach(comp => {
    domains.forEach(domain => {
      const count = Number(comp.domains?.[domain]) || 0;
      for (let i = 0; i < count; i += 1) {
        domainSequence.push(domain);
      }
    });
  });

  const responses = ResponseStore.getForSection(context.section, context.quarter) || [];
  const masteryData = domains.map(() => null);
  if (Array.isArray(responses) && responses.length > 0 && domainSequence.length > 0) {
    const domainTotals = domains.reduce((acc, domain) => ({ ...acc, [domain]: 0 }), {});
    const domainCorrect = domains.reduce((acc, domain) => ({ ...acc, [domain]: 0 }), {});

    responses.forEach((response) => {
      const answers = Array.isArray(response.responses) ? response.responses : [];
      answers.forEach((value, index) => {
        const domain = domainSequence[index];
        if (!domain) return;
        domainTotals[domain] += 1;
        domainCorrect[domain] += Number(value) || 0;
      });
    });

    domains.forEach((domain, idx) => {
      const total = domainTotals[domain];
      masteryData[idx] = total > 0 ? Number(((domainCorrect[domain] / total) * 100).toFixed(1)) : null;
    });
  }

  const options = {
    chart: { type: 'line', height: 280, toolbar: { show: false } },
    stroke: { width: [0, 3], curve: 'smooth' },
    plotOptions: { bar: { horizontal: false, columnWidth: '40%', borderRadius: 4 } },
    colors: ['#3C50E0', '#10B981'],
    series: [
      { name: 'Target TOS Items', type: 'column', data: targetItemsByDomain },
      { name: 'Student Mastery Rate %', type: 'line', data: masteryData }
    ],
    xaxis: { categories: domainLabels },
    yaxis: [
      { title: { text: 'Target Item Count' }, min: 0 },
      { opposite: true, title: { text: 'Mastery %' }, min: 0, max: 100 }
    ],
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        { formatter: (value) => `${Number(value).toFixed(0)} item(s)` },
        { formatter: (value) => (value == null ? 'N/A' : `${Number(value).toFixed(1)}%`) }
      ]
    }
  };

  activeChart = new ApexCharts(container, options);
  activeChart.render();
}

function renderDifficultyCurve(selector, context) {
  const container = document.querySelector(selector);
  if (!container) return;

  const { categories, data } = getDifficultyCurveData(context.section, context.quarter, context.subject);
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = NoData.renderCard(
      'No item difficulty data available',
      'Import or collect student responses for the selected section and quarter to generate the difficulty curve.',
      'Open Exam Import',
      '/exam-import.html'
    );
    return;
  }

  const options = {
    chart: { type: 'area', height: 280, toolbar: { show: false } },
    stroke: { curve: 'smooth', width: 2 },
    colors: ['#F59E0B'],
    fill: { opacity: 0.2 },
    series: [{ name: 'Difficulty Index (P_i)', data }],
    xaxis: { categories },
    yaxis: { min: 0, max: 1.0 }
  };
  activeChart = new ApexCharts(container, options);
  activeChart.render();
}
