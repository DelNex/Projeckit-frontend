// Quarterly Reports Archive View Script
import { ConfigStore } from '../stores/config-store.js';
import { ResponseStore } from '../stores/response-store.js';
import { ImportStore } from '../stores/import-store.js';
import { AppSettingsStore } from '../stores/app-settings-store.js';

function formatNumber(n, digits = 2) {
  if (n == null || isNaN(n)) return 'N/A';
  return Number(n).toFixed(digits);
}

function formatPercent(n, digits = 1) {
  if (n == null || isNaN(n)) return 'N/A';
  return `${Number(n).toFixed(digits)}%`;
}

function computeStudentStats(responsesArray) {
  // returns { meanRaw, stdDev, mps, outstandingCount, didNotMeetCount }
  const n = responsesArray.length;
  if (!n) return null;
  const itemCount = responsesArray[0]?.responses?.length || 0;
  if (itemCount === 0) return null;

  const scores = responsesArray.map(s => {
    const sum = Array.isArray(s.responses) ? s.responses.reduce((a, v) => a + (Number(v) || 0), 0) : 0;
    return sum;
  });

  const meanRaw = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((a, b) => a + Math.pow(b - meanRaw, 2), 0) / (n > 1 ? (n - 1) : 1);
  const stdDev = Math.sqrt(variance);

  // compute per-student MPS and counts
  const perStudentMps = scores.map(s => (itemCount > 0 ? (s / itemCount) * 100 : 0));
  const outstandingCount = perStudentMps.filter(p => p >= AppSettingsStore.get().standards.bands[0].min).length;
  const didNotMeetCount = perStudentMps.filter(p => p < AppSettingsStore.mpsPassing()).length;

  const overallMps = (scores.reduce((a, b) => a + b, 0) / (n * itemCount)) * 100;

  return {
    meanRaw,
    stdDev,
    overallMps,
    outstandingCount,
    didNotMeetCount,
    itemCount
  };
}

export function initReportsView() {
  console.log('[Project KIT] Initializing Quarterly Reports Archive View');

  // Populate static header fields
  const config = ConfigStore.getSafe();
  const proponentEl = document.getElementById('report-proponent');
  if (proponentEl && config.faculty) {
    proponentEl.textContent = `${config.faculty.teacherName} (${config.faculty.designation})`;
  }

  const subjectEl = document.getElementById('report-subject');
  if (subjectEl && config.subjects && config.subjects.length > 0) {
    subjectEl.textContent = config.subjects[0].title; // Use first subject as default
  }

  const gradeLevelEl = document.getElementById('report-grade-level');
  if (gradeLevelEl && config.sections && config.sections.length > 0) {
    gradeLevelEl.textContent = `${config.sections[0].grade} ${config.sections[0].strand}`; // Use first section as default
  }

  const periodEl = document.getElementById('report-period');
  if (periodEl && config.academicPeriod) {
    periodEl.textContent = `${config.academicPeriod.schoolYear} (${config.academicPeriod.term})`;
  }

  // Populate prepared by using ConfigStore.userProfile
  const userEl = document.getElementById('report-user');
  if (userEl && config.userProfile) {
    userEl.textContent = `${config.userProfile.name} (${config.userProfile.role})`;
  }

  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;

  // Build rows from authoritative sources in precedence: ResponseStore -> ImportStore -> ConfigStore
  const activeTerm = config.academicPeriod?.term || null;
  const imports = ImportStore.get();

  const rows = config.sections.map(section => {
    const sectionName = section.name || section;
    const metrics = ResponseStore.getSectionMetrics(sectionName, activeTerm);

    if (metrics.totalStudents > 0) {
      const stats = computeStudentStats(metrics.responses);
      return {
        sectionName,
        examinees: metrics.totalStudents,
        meanRaw: stats?.meanRaw ?? 0,
        stdDev: stats?.stdDev ?? 0,
        mps: stats?.overallMps ?? 0,
        outstanding: stats?.outstandingCount ?? 0,
        didNotMeet: stats?.didNotMeetCount ?? 0,
        source: 'responses'
      };
    }

    // Fallback: look for import metadata for the section + quarter
    const importEntry = imports.find(i => {
      if (!i || !i.section) return false;
      const sameSection = i.section === sectionName || i.section === section.name;
      const sameTerm = !activeTerm || i.term == null || String(i.term).trim() === String(activeTerm).trim();
      return sameSection && sameTerm;
    });

    if (importEntry) {
      return {
        sectionName,
        examinees: importEntry.studentCount ?? (section.studentCount || 'N/A'),
        meanRaw: 'N/A',
        stdDev: 'N/A',
        mps: importEntry.mps ?? 'N/A',
        outstanding: 'N/A',
        didNotMeet: 'N/A',
        source: 'import'
      };
    }

    // Last resort: use configured studentCount if present (explicitly show N/A for stats)
    return {
      sectionName,
      examinees: section.studentCount ?? 'N/A',
      meanRaw: 'N/A',
      stdDev: 'N/A',
      mps: 'N/A',
      outstanding: 'N/A',
      didNotMeet: 'N/A',
      source: 'config'
    };
  });

  tbody.innerHTML = rows.map(r => `
    <tr class="border-b border-gray-100 dark:border-gray-800">
      <td class="px-3 py-2 font-medium">${r.sectionName}</td>
      <td class="px-3 py-2 text-center">${r.examinees}</td>
      <td class="px-3 py-2 text-center">${r.meanRaw === 'N/A' ? 'N/A' : formatNumber(r.meanRaw, 2)}</td>
      <td class="px-3 py-2 text-center">${r.stdDev === 'N/A' ? 'N/A' : formatNumber(r.stdDev, 2)}</td>
      <td class="px-3 py-2 text-center font-bold text-brand-500">${r.mps === 'N/A' ? 'N/A' : formatPercent(r.mps, 1)}</td>
      <td class="px-3 py-2 text-center">${r.outstanding}</td>
      <td class="px-3 py-2 text-center text-rose-600 font-bold">${r.didNotMeet}</td>
    </tr>
  `).join('');

  // Prepare report payload builder for backend integration
  function buildReportPayload() {
    const timestamp = new Date().toISOString();
    return {
      generatedAt: timestamp,
      generatedBy: config.userProfile || null,
      period: config.academicPeriod || null,
      subject: config.subjects && config.subjects[0] ? config.subjects[0] : null,
      sections: rows.map(r => ({
        sectionName: r.sectionName,
        examinees: r.examinees,
        meanRaw: r.meanRaw === 'N/A' ? null : Number(r.meanRaw),
        stdDev: r.stdDev === 'N/A' ? null : Number(r.stdDev),
        mps: r.mps === 'N/A' ? null : Number(r.mps),
        outstanding: r.outstanding === 'N/A' ? null : r.outstanding,
        didNotMeet: r.didNotMeet === 'N/A' ? null : r.didNotMeet,
        source: r.source
      })),
      configSnapshot: config
    };
  }

  // Print button: dispatch payload event so integration layer can intercept and send to backend before print
  const printBtn = document.getElementById('btn-print-report');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const payload = buildReportPayload();
      // Dispatch a global event for backend integrators to listen for and POST the payload
      window.dispatchEvent(new CustomEvent('deped_report_generated', { detail: payload }));
      // Also log for debugging
      try { console.info('[Project KIT] Report payload prepared', payload); } catch (e) {}
      window.print();
    });
  }
}

