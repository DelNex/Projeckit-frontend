import { getAuditLogs } from '../api/admin-api.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../ui/toast.js';

function renderActionBadge(action) {
  const normalized = String(action || '').trim().toUpperCase();
  let colorClasses = 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 border-brand-200 dark:border-brand-800';

  if (normalized.includes('LOGIN') || normalized.includes('AUTH')) {
    colorClasses = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  } else if (normalized.includes('APPROVE') || normalized.includes('CREATE')) {
    colorClasses = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  } else if (normalized.includes('REJECT') || normalized.includes('DELETE') || normalized.includes('SUSPEND')) {
    colorClasses = 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  } else if (normalized.includes('CONFIG') || normalized.includes('UPDATE')) {
    colorClasses = 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800';
  }

  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${colorClasses}">${escapeHTML(action)}</span>`;
}

function resolveUserName(log) {
  const name = log.user?.displayName || log.user?.email || null;
  if (name) return String(name);
  if (log.userId != null) return `User ${log.userId}`;
  return 'System';
}

function renderRow(log) {
  const timestamp = escapeHTML(new Date(log.createdAt).toLocaleString() || 'Unknown');
  const user = escapeHTML(resolveUserName(log));
  const actionBadge = renderActionBadge(log.action || 'ACTIVITY');
  const target = escapeHTML(log.data || '—');
  const ip = escapeHTML(log.ip || '—');

  return `
    <tr class="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
      <td class="px-4 py-3 font-mono text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">${timestamp}</td>
      <td class="px-4 py-3 font-bold text-gray-900 dark:text-white text-xs">${user}</td>
      <td class="px-4 py-3">${actionBadge}</td>
      <td class="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-w-sm text-xs">${target}</td>
      <td class="px-4 py-3 font-mono text-gray-500 dark:text-gray-400 text-xs">${ip}</td>
    </tr>
  `;
}

export async function initAuditLogsView() {
  const tableBody = document.getElementById('audit-logs-table-body');
  const searchInput = document.getElementById('search-audit-logs');
  if (!tableBody) return;

  let allLogs = [];

  const filterAndRender = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const filtered = allLogs.filter((log) => {
      const uStr = resolveUserName(log).toLowerCase();
      const aStr = String(log.action || '').toLowerCase();
      const dStr = String(log.data || '').toLowerCase();
      return uStr.includes(query) || aStr.includes(query) || dStr.includes(query);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No matching audit logs found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(renderRow).join('');
  };

  tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">Loading audit logs…</td></tr>';

  try {
    const response = await getAuditLogs();
    allLogs = response?.data || [];
    filterAndRender();
  } catch (error) {
    console.error('[AuditLogsView] Failed to load audit logs', error);
    tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-red-600 dark:text-red-400">Unable to load audit logs.</td></tr>';
    showToast('Unable to load audit logs. Please try again later.');
  }

  searchInput?.addEventListener('input', filterAndRender);
}
