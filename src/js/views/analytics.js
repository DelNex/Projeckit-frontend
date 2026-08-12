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

  // Populate Section Select dynamically based on Strand & Grade filter
  const updateSectionDropdown = () => {
    if (!sectionSelect) return;
    const strandVal = strandSelect?.value || 'all';
    const gradeVal = gradeSelect?.value || 'all';

    // Always start with 'All Sections'
    const allSections = config.sections || [];

    let matchingSections = allSections;
    if (strandVal !== 'all') {
      const strandNormalized = strandVal.replace(/\s+-\s+/g, '-').trim().toLowerCase();
      matchingSections = matchingSections.filter(sec => {
        const secStrand = (sec.strand || '').replace(/\s+-\s+/g, '-').trim().toLowerCase();
        return secStrand.includes(strandNormalized) || strandNormalized.includes(secStrand);
      });
    }
    if (gradeVal !== 'all') {
      const gradeNum = gradeVal.replace(/\D/g, '');
      if (gradeNum) {
        matchingSections = matchingSections.filter(sec => {
          const secGradeNum = (sec.grade || '').replace(/\D/g, '');
          if (secGradeNum) return secGradeNum === gradeNum;
          const secNamePrefix = (sec.name || '').split('-')[0].replace(/\D/g, '');
          return secNamePrefix === gradeNum;
        });
      }
    }

    sectionSelect.disabled = false;
    const sectionOptions = [
      '<option value="all">All Sections</option>',
      ...matchingSections.map(s =>
        `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)} (${escapeHTML(s.strand)})</option>`
      )
    ];
    sectionSelect.innerHTML = sectionOptions.join('');
  };

  updateSectionDropdown();

  // Picklists default to 'all' so charts always render on first load
  if (sySelect) sySelect.value = 'all';
  if (gradeSelect) gradeSelect.value = 'all';
  if (strandSelect) strandSelect.value = 'all';
  if (termSelect) termSelect.value = 'all';
  if (sectionSelect) sectionSelect.value = 'all';
  if (subjectSelect) subjectSelect.value = 'all';

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
    const sectionVal = sectionSelect?.value || 'all';
    const syVal = sySelect?.value || 'all';
    const qtrVal = termSelect?.value || 'all';
    const strandVal = strandSelect?.value || 'all';

    const elScopeTag = document.getElementById('metric-scope-tag');
    const elMpsScore = document.getElementById('metric-mps-score');
    const elMasteryTag = document.getElementById('metric-mastery-tag');

    // Derive scope from activeTab for simplicity (sectional => class, longitudinal => year)
    activeScope = activeTab === 'longitudinal' ? 'year' : 'class';

    // Compute aggregate MPS for header pills
    const sectionsToAggregate = sectionVal === 'all'
      ? (config.sections || []).map(s => s.name)
      : [sectionVal];
    const quartersToAggregate = qtrVal === 'all'
      ? ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter']
      : [qtrVal];

    if (elScopeTag) {
      elScopeTag.textContent = sectionVal === 'all'
        ? 'All Sections'
        : (activeScope === 'class' ? `Class: ${sectionVal}` : `Longitudinal: ${syVal}`);
    }

    // Aggregate MPS across all selected sections and quarters
    let totalCorrectAll = 0, totalDenomAll = 0;
    for (const sec of sectionsToAggregate) {
      for (const qtr of quartersToAggregate) {
        const responses = ResponseStore.getForSection(sec, qtr) || [];
        if (!Array.isArray(responses) || responses.length === 0) continue;
        const items = Array.isArray(responses[0].responses) ? responses[0].responses.length : 0;
        if (items === 0) continue;
        const correct = responses.reduce((acc, s) => {
          return acc + (Array.isArray(s.responses) ? s.responses.reduce((a, v) => a + (Number(v) || 0), 0) : 0);
        }, 0);
        totalCorrectAll += correct;
        totalDenomAll += responses.length * items;
      }
    }
    const computedMps = totalDenomAll > 0 ? Number(((totalCorrectAll / totalDenomAll) * 100).toFixed(1)) : null;

    if (computedMps != null) {
      if (elMpsScore) elMpsScore.textContent = `Mean MPS: ${computedMps}%`;
      if (elMasteryTag) elMasteryTag.textContent = computedMps >= AppSettingsStore.mpsPassing() ? 'Mastery: High' : 'Mastery: Moderate';
    } else {
      if (elMpsScore) elMpsScore.textContent = `Mean MPS: N/A`;
      if (elMasteryTag) elMasteryTag.textContent = `Mastery: N/A`;
    }

    // Render Tab Content & ApexChart after brief transition
    setTimeout(() => {
      switchTabContent(activeTab, contentContainer, {
        scope: activeScope,
        schoolYear: syVal,
        section: sectionVal,
        strand: strandVal,
        subject: subjectSelect?.value || 'all',
        quarter: qtrVal
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

  const cfg = ConfigStore.getSafe();
  const cfgSections = cfg.sections || [];

  const sections = cfgSections.map(s => ({
    id: s.id || s.name,
    name: s.name,
    strand: s.strand,
    studentCount: s.studentCount
  }));

  // If a specific section is selected, put it first; else show all
  let ordered = [];
  if (context.section && context.section !== 'all') {
    const active = sections.find(s => s.name === context.section);
    if (active) ordered.push(active);
    ordered = ordered.concat(sections.filter(s => s.name !== context.section));
  } else {
    ordered = sections.slice();
  }

  // Show up to 8 sections in chart
  ordered = ordered.slice(0, 8);

  const quartersToUse = context.quarter === 'all'
    ? ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter']
    : [context.quarter];

  const categories = ordered.map(s =>
    `${s.name}${s.name === context.section ? ' ✓' : ''}`
  );

  const data = ordered.map(s => {
    // Aggregate MPS across relevant quarters
    let totalCorrect = 0, totalDenom = 0;
    for (const qtr of quartersToUse) {
      try {
        const responses = ResponseStore.getForSection(s.name, qtr) || [];
        if (!Array.isArray(responses) || responses.length === 0) continue;
        const items = Array.isArray(responses[0].responses) ? responses[0].responses.length : 0;
        if (items === 0) continue;
        const correct = responses.reduce((acc, st) => {
          return acc + (Array.isArray(st.responses) ? st.responses.reduce((a, v) => a + (Number(v) || 0), 0) : 0);
        }, 0);
        totalCorrect += correct;
        totalDenom += responses.length * items;
      } catch (e) { /* ignore */ }
    }
    if (totalDenom > 0) return Number(((totalCorrect / totalDenom) * 100).toFixed(1));

    // Fallback: ImportStore
    let fallbackMps = null;
    try {
      const recent = ImportStore.getRecent(20);
      const importEntry = recent.find(r => (r.section || '').toString() === s.name);
      if (importEntry && importEntry.mps != null) {
        const n = typeof importEntry.mps === 'string'
          ? parseFloat(importEntry.mps.replace('%','').trim())
          : Number(importEntry.mps);
        if (Number.isFinite(n)) fallbackMps = n;
      }
    } catch (e) { /* ignore */ }

    try {
      const cfgSec = (cfg.sections || []).find(x => x.name === s.name || x.id === s.id);
      if (cfgSec && cfgSec.mps != null) fallbackMps = Number(cfgSec.mps);
    } catch (e) {}

    return fallbackMps ?? null;
  });

  // If no data at all, show NoData message
  if (data.every(v => v === null)) {
    container.innerHTML = NoData.renderCard(
      'No assessment data available yet',
      'Complete assessments and record student responses to see MPS comparison charts here.',
      'Go to Assessments',
      'assessments.html'
    );
    return;
  }

  const options = {
    chart: { type: 'bar', height: 300, toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '45%', borderRadius: 4 } },
    colors: [ cssVar('--color-success-500', '#10B981') ],
    series: [{ name: 'Class MPS %', data }],
    xaxis: { categories, max: 100 },
    dataLabels: {
      enabled: true,
      formatter: (val) => val != null ? `${val}%` : 'N/A',
    },
    tooltip: { y: { formatter: (val) => val != null ? `${val}%` : 'No data' } },
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

  // When 'all' sections, aggregate across every configured section
  const sectionsForLongitudinal = context.section === 'all'
    ? (cfg.sections || []).map(s => s.name)
    : [context.section];

  const series = years.map((sy) => {
    const data = quarters.map(q => {
      let totalCorrect = 0, totalDenom = 0;

      for (const sec of sectionsForLongitudinal) {
        // 1) ImportStore with schoolYear
        const fromImport = findImportMps(sec, sy, q);
        if (fromImport != null) { totalCorrect += fromImport; totalDenom += 100; continue; }

        // 2) Live ResponseStore for current school year
        if (sy === currentSchoolYear) {
          const respMps = computeMpsFromResponses(sec, q);
          if (respMps != null) { totalCorrect += respMps; totalDenom += 100; continue; }
        }

        // 3) Legacy import fallback
        const legacy = importEntries.find(e =>
          (e.section || '').toString() === sec &&
          ResponseStore.normalizeQuarterName(e.quarter || '') === ResponseStore.normalizeQuarterName(q)
        );
        if (legacy && legacy.mps != null) {
          const v = typeof legacy.mps === 'string' ? parseFloat(legacy.mps.replace('%','').trim()) : Number(legacy.mps);
          if (Number.isFinite(v)) { totalCorrect += v; totalDenom += 100; }
        }
      }

      return totalDenom > 0 ? Number((totalCorrect / (totalDenom / 100)).toFixed(1)) : null;
    });

    return { name: `S.Y. ${sy} MPS %`, data };
  });

  const hasAnyData = series.some(s => s.data.some(v => v != null));
  if (!hasAnyData) {
    container.innerHTML = NoData.renderCard(
      'No longitudinal data available yet',
      'Complete assessments across multiple quarters and school years to see growth trends here.',
      'Go to Assessments',
      'assessments.html'
    );
    return;
  }

  const options = {
    chart: { type: 'line', height: 280, toolbar: { show: false } },
    stroke: { curve: 'smooth', width: 3 },
    colors: [ cssVar('--color-brand-500', '#3C50E0'), cssVar('--color-success-500', '#10B981'), cssVar('--color-warning-500', '#F59E0B') ],
    series,
    xaxis: { categories: ['Q1', 'Q2', 'Q3', 'Q4'] },
    yaxis: { min: 0, max: 100, title: { text: 'MPS %' } },
    tooltip: { y: { formatter: v => v != null ? `${v}%` : 'No data' } }
  };

  activeChart = new ApexCharts(container, options);
  activeChart.render();
}

function renderCognitiveChart(selector, context) {
  const container = document.querySelector(selector);
  if (!container) return;

  const domains = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  const domainLabels = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];

  const cfg = ConfigStore.getSafe();
  const allSections = cfg.sections || [];

  // Resolve effective section(s): 'all' means first available section for TOS lookup
  const effectiveSection = context.section === 'all'
    ? (allSections[0]?.name || '')
    : context.section;
  const effectiveQuarter = context.quarter === 'all' ? 'First Quarter' : context.quarter;
  const effectiveSubject = context.subject === 'all'
    ? (cfg.subjects?.[0]?.title || 'Empowerment Technologies')
    : (context.subject || 'Empowerment Technologies');

  const sectionMeta = allSections.find(s => s.name === effectiveSection || s.id === effectiveSection);
  const grade = sectionMeta?.grade || 'Grade 11';
  const schoolYear = (context.schoolYear === 'all' ? cfg.academicPeriod?.schoolYear : context.schoolYear) || '2025–2026';
  const strand = context.strand === 'all' ? (sectionMeta?.strand || 'TVL - ICT') : (context.strand || 'TVL - ICT');

  const competencies = getCompetenciesForContext(effectiveSubject, effectiveQuarter, schoolYear, grade, strand, effectiveSection);
  if (!competencies || competencies.length === 0) {
    container.innerHTML = NoData.renderCard(
      'No cognitive domain mapping available',
      'There are no TOS competencies mapped for the selected subject and quarter. Adjust your selection or add competencies in the TOS editor inside an assessment.',
      'Go to Assessments',
      'assessments.html'
    );
    return;
  }

  const targetItemsByDomain = domains.map(domain =>
    competencies.reduce((sum, comp) => sum + (Number(comp.domains?.[domain]) || 0), 0)
  );

  const domainSequence = [];
  competencies.forEach(comp => {
    domains.forEach(domain => {
      const count = Number(comp.domains?.[domain]) || 0;
      for (let i = 0; i < count; i += 1) domainSequence.push(domain);
    });
  });

  // Aggregate responses: if 'all' sections, combine all sections; if 'all' quarters, combine all quarters
  const sectionsToScan = context.section === 'all' ? allSections.map(s => s.name) : [effectiveSection];
  const quartersToScan = context.quarter === 'all'
    ? ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter']
    : [effectiveQuarter];

  const domainTotals = domains.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
  const domainCorrect = domains.reduce((acc, d) => ({ ...acc, [d]: 0 }), {});
  let hasResponses = false;

  for (const sec of sectionsToScan) {
    for (const qtr of quartersToScan) {
      const responses = ResponseStore.getForSection(sec, qtr) || [];
      if (!Array.isArray(responses) || responses.length === 0) continue;
      hasResponses = true;
      responses.forEach(response => {
        const answers = Array.isArray(response.responses) ? response.responses : [];
        answers.forEach((value, index) => {
          const domain = domainSequence[index];
          if (!domain) return;
          domainTotals[domain] += 1;
          domainCorrect[domain] += Number(value) || 0;
        });
      });
    }
  }

  const masteryData = domains.map(domain => {
    const total = domainTotals[domain];
    return total > 0 ? Number(((domainCorrect[domain] / total) * 100).toFixed(1)) : null;
  });

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
      shared: true, intersect: false,
      y: [
        { formatter: v => `${Number(v).toFixed(0)} item(s)` },
        { formatter: v => v == null ? 'N/A' : `${Number(v).toFixed(1)}%` }
      ]
    }
  };

  activeChart = new ApexCharts(container, options);
  activeChart.render();
}

function renderDifficultyCurve(selector, context) {
  const container = document.querySelector(selector);
  if (!container) return;

  const cfg = ConfigStore.getSafe();

  // Resolve effective section: 'all' → first configured section
  const effectiveSection = context.section === 'all'
    ? (cfg.sections?.[0]?.name || '')
    : context.section;
  const effectiveQuarter = context.quarter === 'all' ? 'First Quarter' : context.quarter;
  const effectiveSubject = context.subject === 'all'
    ? (cfg.subjects?.[0]?.title || 'Empowerment Technologies')
    : context.subject;

  const { categories, data } = getDifficultyCurveData(effectiveSection, effectiveQuarter, effectiveSubject);
  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = NoData.renderCard(
      'No item difficulty data available',
      'Complete assessments and record student responses to generate the psychometric difficulty curve.',
      'Go to Assessments',
      'assessments.html'
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
    yaxis: { min: 0, max: 1.0 },
    annotations: {
      yaxis: [
        { y: 0.36, y2: 0.80, fillColor: '#10B981', opacity: 0.07, label: { text: 'Optimal range (0.36–0.80)', style: { fontSize: '10px' } } }
      ]
    },
    tooltip: { y: { formatter: v => `P = ${Number(v).toFixed(2)}` } }
  };
  activeChart = new ApexCharts(container, options);
  activeChart.render();
}
