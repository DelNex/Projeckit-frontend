// Dashboard View Script
import ApexCharts from 'apexcharts';
import { DomPatcher } from '../dom-patcher.js';
import { ConfigStore } from '../stores/config-store.js';
import { ImportStore } from '../stores/import-store.js';
import { ResponseStore } from '../stores/response-store.js';
import { AppSettingsStore } from '../stores/app-settings-store.js';
import { resolveSectionName } from '../utils.js';

function cssVar(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch(e){ return fallback; }
}

function parseMpsValue(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number(value);
  const parsed = parseFloat(String(value).replace('%','').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function quarterSortKey(label) {
  const quarterMap = {
    'First Quarter': 1,
    'Second Quarter': 2,
    'Third Quarter': 3,
    'Fourth Quarter': 4
  };
  const parts = String(label).split(' ');
  const qName = parts.slice(0, 2).join(' ');
  const year = parts.slice(2).join(' ');
  const qValue = quarterMap[qName] || 0;
  const yearValue = year ? Number(year.split('–')[0]) || Number(year.split('-')[0]) || 0 : 0;
  return yearValue * 10 + qValue;
}

export function initDashboard() {
  console.log('[Project KIT] Initializing Executive Academic Dashboard View');

  const schoolNameEl = document.getElementById('dashboard-school-name');
  if (schoolNameEl) schoolNameEl.textContent = AppSettingsStore.get().school.name || 'the school';
  

  // Set KPI Cards
  const mpsElem = document.getElementById('kpi-mps');
  const examineesElem = document.getElementById('kpi-examinees');
  const atRiskElem = document.getElementById('kpi-at-risk');
  const sectionsElem = document.getElementById('kpi-sections');

  // Compute aggregate MPS across ConfigStore.sections using ResponseStore (current quarter) and persisted import data; avoid hardcoded mock fallbacks
  let displayMps = 0;
  try {
    const cfg = ConfigStore.getSafe();
    const cfgSections = cfg.sections || [];
    const activeQuarter = cfg.academicPeriod?.quarter || 'First Quarter';
    let totalWeighted = 0;
    let totalStudents = 0;
    let totalSections = cfgSections.length;
    let totalExaminees = 0;
    let atRiskCount = 0;

    cfgSections.forEach(s => {
      const secName = s.name;
      // Prefer response-derived metrics for the active quarter
      const metrics = ResponseStore.getSectionMetrics(secName, activeQuarter);
      let secMps = null;
      let secStudents = 0;

      if (metrics && metrics.totalStudents > 0 && metrics.itemCount > 0) {
        secMps = metrics.averageMps;
        secStudents = metrics.totalStudents;
      } else {
        // fallback to configured section counts / mps if present
        if (s.studentCount != null) secStudents = Number(s.studentCount) || 0;
        if (s.mps != null) secMps = Number(s.mps);
      }

      if (secMps != null && secStudents > 0) {
        totalWeighted += secMps * secStudents;
        totalStudents += secStudents;
      }

      totalExaminees += secStudents;

      if (secMps != null && secMps < 75) {
        atRiskCount += secStudents;
      }
    });

    displayMps = totalStudents > 0 ? Number((totalWeighted / totalStudents).toFixed(1)) : 0;

    if (mpsElem) mpsElem.textContent = `${displayMps}%`;
    if (examineesElem) examineesElem.textContent = `${totalExaminees}`;
    if (atRiskElem) atRiskElem.textContent = `${atRiskCount}`;
    if (sectionsElem) sectionsElem.textContent = `${totalSections}`;
  } catch (e) {
    // On error, present safe zeros rather than mock values
    if (mpsElem) mpsElem.textContent = `0%`;
    if (examineesElem) examineesElem.textContent = `0`;
    if (atRiskElem) atRiskElem.textContent = `0`;
    if (sectionsElem) sectionsElem.textContent = `0`;
  }

  // Render Charts
  renderMPSTrendChart();
  renderLearnerTierChart();
  renderRecentImportsTable();
}

function renderMPSTrendChart() {
  const container = document.querySelector('#chart-mps-trend');
  if (!container) return;

  const imports = ImportStore.get();
  const groups = {};

  imports.forEach(entry => {
    if (!entry || entry.mps == null || !entry.quarter) return;
    const quarter = ResponseStore.normalizeQuarterName(entry.quarter);
    const year = entry.schoolYear || entry.school_year || '';
    const mpsValue = parseMpsValue(entry.mps);
    if (mpsValue == null) return;
    const label = year ? `${quarter} ${year}` : quarter;
    groups[label] = groups[label] || [];
    groups[label].push(mpsValue);
  });

  const labels = Object.keys(groups).sort((a, b) => quarterSortKey(a) - quarterSortKey(b));
  const seriesData = labels.map(label => {
    const values = groups[label] || [];
    if (!values.length) return null;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Number(avg.toFixed(1));
  });

  if (!labels.length) {
    container.innerHTML = `<div class="flex h-72 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">No longitudinal MPS data available yet.</div>`;
    return;
  }

  const options = {
    chart: { type: 'line', height: 310, toolbar: { show: false } },
    stroke: { curve: 'smooth', width: 3 },
    colors: [cssVar('--color-brand-500', '#3C50E0')],
    series: [{ name: 'MPS %', data: seriesData }],
    xaxis: { categories: labels },
    yaxis: { min: 0, max: 100 },
    grid: { borderColor: cssVar('--color-gray-200', '#E2E8F0') },
    tooltip: { y: { formatter: val => val != null ? `${val}%` : 'N/A' } }
  };
  const chart = new ApexCharts(container, options);
  chart.render();
}

function renderLearnerTierChart() {
  const container = document.querySelector('#chart-learner-tiers');
  if (!container) return;

  const storedResponses = ResponseStore.get();
  const bands = [...(AppSettingsStore.get().standards.bands || [])].sort((a, b) => b.min - a.min);
  const tierCounts = bands.map(() => 0);
  let totalStudents = 0;

  const countTier = (mps) => {
    const idx = bands.findIndex((b) => mps >= b.min);
    if (idx >= 0) tierCounts[idx] += 1;
  };

  Object.values(storedResponses).forEach(sectionEntry => {
    if (Array.isArray(sectionEntry)) {
      sectionEntry.forEach(student => {
        if (!Array.isArray(student.responses)) return;
        const itemCount = student.responses.length;
        if (!itemCount) return;
        const totalCorrect = student.responses.reduce((sum, value) => sum + (Number(value) || 0), 0);
        const mps = Number(((totalCorrect / itemCount) * 100).toFixed(1));
        totalStudents += 1;
        countTier(mps);
      });
      return;
    }

    Object.values(sectionEntry || {}).forEach(quarterResponses => {
      if (!Array.isArray(quarterResponses)) return;
      quarterResponses.forEach(student => {
        if (!Array.isArray(student.responses)) return;
        const itemCount = student.responses.length;
        if (!itemCount) return;
        const totalCorrect = student.responses.reduce((sum, value) => sum + (Number(value) || 0), 0);
        const mps = Number(((totalCorrect / itemCount) * 100).toFixed(1));
        totalStudents += 1;
        countTier(mps);
      });
    });
  });

  if (totalStudents === 0) {
    container.innerHTML = `<div class="flex h-72 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">No learner performance data available yet.</div>`;
    return;
  }

  const labels = bands.map((band, index) => {
    const upper = index === 0 ? 100 : bands[index - 1].min - 1;
    if (index === bands.length - 1) return `${band.label} (<${band.min}%)`;
    return `${band.label} (${band.min}-${upper}%)`;
  });

  const options = {
    chart: { type: 'donut', height: 280 },
    labels,
    series: tierCounts,
    colors: [
      cssVar('--color-success-500', '#10B981'),
      cssVar('--color-blue-light-500', '#3B82F6'),
      cssVar('--color-warning-500', '#F59E0B'),
      cssVar('--color-brand-600', '#6366F1'),
      cssVar('--color-error-500', '#EF4444')
    ],
    legend: { position: 'bottom' },
    tooltip: { y: { formatter: val => `${val} students` } }
  };
  const chart = new ApexCharts(container, options);
  chart.render();
}

function renderRecentImportsTable() {
  const config = ConfigStore.getSafe();
  DomPatcher.updateTable({
    containerId: 'recent-imports-table-body',
    columns: 5,
    rowCount: 3,
    fetchFn: async () => {
      try {
        const { ImportStore } = await import('../stores/import-store.js');
        return ImportStore.getRecent(10);
      } catch (e) {
        return [];
      }
    },
    renderRowFn: (item) => `
      <tr class="border-b border-stroke dark:border-strokedark hover:bg-gray-50 dark:hover:bg-gray-800">
        <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">${item.fileName}</td>
        <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">${resolveSectionName(item.section, config)}</td>
        <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">${item.date}</td>
        <td class="px-4 py-3 text-sm font-bold text-brand-500">${item.mps ?? 'N/A'}</td>
        <td class="px-4 py-3 text-sm"><span class="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">${item.status}</span></td>
      </tr>
    `
  });
}
