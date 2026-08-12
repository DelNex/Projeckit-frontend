// Exam Attendance Component
// Responsible for rendering the student attendance table & pagination

import { escapeHTML } from '../../utils.js';

export function renderExamAttendance(records, meta, tbodyEl, summaryEl, page, pageSize, totalPages) {
  if (!tbodyEl) return;

  const list = Array.isArray(records) ? records : [];
  const presentCount = list.filter(r => r.status === 'PRESENT').length;
  const total = meta?.total || list.length;

  if (summaryEl) {
    summaryEl.textContent = `${presentCount} of ${total} students marked present`;
  }

  if (!list.length) {
    tbodyEl.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-xs text-gray-400">No students in attendance roster for this assessment.</td></tr>`;
    return;
  }

  const offset = (page - 1) * pageSize;
  tbodyEl.innerHTML = list.map((att, i) => {
    const studentName = att.student?.name || att.studentLrn || '—';
    const statusCls = att.status === 'PRESENT'
      ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400'
      : att.status === 'ABSENT'
        ? 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
        : 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';

    return `
      <tr class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
        <td class="px-4 py-2.5 text-gray-400 font-medium text-[11px]">${offset + i + 1}</td>
        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-white text-xs">${escapeHTML(studentName)}</td>
        <td class="px-4 py-2.5 text-gray-400 font-mono text-[11px]">${escapeHTML(att.studentLrn || '')}</td>
        <td class="px-4 py-2.5 text-center">
          <select class="attendance-status-select px-2 py-1 text-[10px] font-bold uppercase rounded-lg border-0 ${statusCls} focus:ring-2 focus:ring-brand-500 cursor-pointer" data-lrn="${escapeHTML(att.studentLrn || '')}">
            <option value="PRESENT" ${att.status === 'PRESENT' ? 'selected' : ''}>Present</option>
            <option value="ABSENT" ${att.status === 'ABSENT' ? 'selected' : ''}>Absent</option>
            <option value="EXCUSED" ${att.status === 'EXCUSED' ? 'selected' : ''}>Excused</option>
            <option value="LATE" ${att.status === 'LATE' ? 'selected' : ''}>Late</option>
          </select>
        </td>
        <td class="px-4 py-2.5">
          <input type="text" class="attendance-notes-input w-full px-2 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-brand-500" data-lrn="${escapeHTML(att.studentLrn || '')}" placeholder="Optional notes…" value="${escapeHTML(att.notes || '')}" />
        </td>
      </tr>`;
  }).join('');
}
