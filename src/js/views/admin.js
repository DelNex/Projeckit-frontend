import { getPendingUsers, getAuditLogs, listTenants } from '../api/admin-api.js';
import { AppSettingsStore } from '../stores/app-settings-store.js';
import { escapeHTML } from '../utils.js';

async function loadTenantSummary() {
  const countEl = document.getElementById('stat-tenant-count');
  if (!countEl) return;
  try {
    const res = await listTenants();
    const tenants = res?.data || [];
    countEl.textContent = `${tenants.length} Tenant${tenants.length === 1 ? '' : 's'}`;
  } catch (e) {
    console.warn('[AdminConsole] Tenants read failed', e);
    countEl.textContent = 'Unavailable';
  }
}

export async function initAdminConsoleView() {
  const pendingCountEl = document.getElementById('stat-pending-count');
  const auditCountEl = document.getElementById('stat-audit-count');
  const activePeriodEl = document.getElementById('stat-academic-period');
  const auditPreviewTable = document.getElementById('admin-audit-preview-tbody');

  // Tenant summary (dedicated management lives on tenants.html)
  loadTenantSummary();

  // Active academic period from the authoritative per-tenant app settings
  try {
    const settings = AppSettingsStore.get();
    const sy = settings.academicPeriod?.schoolYear || '';
    const term = settings.academicPeriod?.term || '';
    if (activePeriodEl) {
      activePeriodEl.textContent = [sy, term].filter(Boolean).join(' • ') || '—';
    }
  } catch (e) {
    console.warn('[AdminConsole] App settings read failed', e);
  }

  // Load Pending Users count
  try {
    const res = await getPendingUsers();
    const pendingList = res?.data || [];
    const count = pendingList.filter(u => u.status === 'PENDING').length;
    if (pendingCountEl) {
      pendingCountEl.textContent = count > 0 ? `${count} Pending` : '0 Pending';
    }
  } catch (e) {
    if (pendingCountEl) pendingCountEl.textContent = '0 Pending';
  }

  // Load Audit Logs count & recent activity preview
  try {
    const res = await getAuditLogs();
    const logs = res?.data || [];
    if (auditCountEl) {
      auditCountEl.textContent = `${logs.length} Total Logs`;
    }

    if (auditPreviewTable) {
      if (logs.length === 0) {
        auditPreviewTable.innerHTML = `
          <tr>
            <td colspan="4" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
              No recent audit events recorded.
            </td>
          </tr>
        `;
      } else {
        const recentLogs = logs.slice(0, 5);
        auditPreviewTable.innerHTML = recentLogs.map((log) => {
          const timestamp = escapeHTML(new Date(log.createdAt).toLocaleString() || 'Unknown');
          const userName = log.user?.displayName || log.user?.email || null;
          const user = escapeHTML(userName ? userName : log.userId ? `User ${log.userId}` : 'System');
          const action = escapeHTML(log.action || 'ACTIVITY');
          const target = escapeHTML(log.data || '—');

          return `
            <tr class="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              <td class="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">${timestamp}</td>
              <td class="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-white">${user}</td>
              <td class="px-4 py-3 text-xs font-bold text-brand-500">${action}</td>
              <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 truncate max-w-xs">${target}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.warn('[AdminConsole] Audit logs read failed', e);
    if (auditPreviewTable) {
      auditPreviewTable.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            Audit logs currently offline or unavailable.
          </td>
        </tr>
      `;
    }
  }
}
