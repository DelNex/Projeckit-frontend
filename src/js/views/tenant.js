import { getTenantDetail } from '../api/admin-api.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../ui/toast.js';

function resolveUserName(log) {
  const name = log.user?.displayName || log.user?.email || null;
  if (name) return String(name);
  if (log.userId != null) return `User ${log.userId}`;
  return 'System';
}

function renderAuditRow(log) {
  return `
    <tr class="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
      <td class="px-4 py-3 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">${escapeHTML(new Date(log.createdAt).toLocaleString() || 'Unknown')}</td>
      <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white">${escapeHTML(resolveUserName(log))}</td>
      <td class="px-4 py-3 font-bold text-brand-500">${escapeHTML(log.action || 'ACTIVITY')}</td>
      <td class="px-4 py-3 text-gray-600 dark:text-gray-300 truncate max-w-xs">${escapeHTML(log.data || '—')}</td>
    </tr>
  `;
}

function renderStatusBadge(status) {
  const normalized = String(status || 'UNKNOWN').toUpperCase();
  if (normalized === 'APPROVED' || normalized === 'ACTIVE') {
    return `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Approved</span>`;
  }
  if (normalized === 'PENDING') {
    return `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Pending</span>`;
  }
  if (normalized === 'SUSPENDED') {
    return `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">Suspended</span>`;
  }
  if (normalized === 'REJECTED') {
    return `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Rejected</span>`;
  }
  return `<span class="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">${escapeHTML(status)}</span>`;
}

export async function initTenantView() {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get('id');
  const titleEl = document.getElementById('tenant-title');
  const subtitleEl = document.getElementById('tenant-subtitle');
  const errorEl = document.getElementById('tenant-error');
  const summaryEl = document.getElementById('tenant-summary');

  if (!tenantId) {
    if (titleEl) titleEl.textContent = 'Tenant Workspace';
    if (subtitleEl) subtitleEl.textContent = 'No tenant selected.';
    errorEl?.classList.remove('hidden');
    showToast('No tenant selected.');
    return;
  }

  try {
    const res = await getTenantDetail(tenantId);
    const tenant = res?.data;
    if (!tenant) throw new Error('Tenant not found.');

    if (titleEl) titleEl.textContent = tenant.name || 'Unnamed tenant';
    if (subtitleEl) {
      const statusText = tenant.isActive ? 'Active' : 'Inactive';
      subtitleEl.textContent = `${statusText} workspace · created ${new Date(tenant.createdAt).toLocaleDateString() || '—'}`;
    }

    const codeEl = document.getElementById('tenant-code');
    if (codeEl) codeEl.textContent = tenant.code || '— (auto-generated on first join)';

    const usersEl = document.getElementById('tenant-stat-users');
    if (usersEl) usersEl.textContent = String(tenant.totalUsers ?? 0);

    const pendingEl = document.getElementById('tenant-stat-pending');
    const pendingCount = tenant.userCounts?.PENDING || 0;
    if (pendingEl) pendingEl.textContent = String(pendingCount);

    const configsEl = document.getElementById('tenant-stat-configs');
    if (configsEl) configsEl.textContent = String(tenant.configCount ?? 0);

    const periodEl = document.getElementById('tenant-stat-period');
    const period = tenant.appSettings?.academicPeriod;
    if (periodEl) {
      periodEl.textContent = [period?.schoolYear, period?.term].filter(Boolean).join(' • ') || '—';
    }

    const countsEl = document.getElementById('tenant-user-counts');
    const counts = tenant.userCounts || {};
    const entries = Object.entries(counts);
    if (countsEl) {
      countsEl.innerHTML = entries.length
        ? entries.map(([status, count]) => `${renderStatusBadge(status)} <span class="mr-2 text-gray-400">× ${count}</span>`).join('')
        : '<span class="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold">No members yet</span>';
    }

    const auditTbody = document.getElementById('tenant-audit-tbody');
    const logs = tenant.recentAuditLogs || [];
    if (auditTbody) {
      auditTbody.innerHTML = logs.length
        ? logs.map(renderAuditRow).join('')
        : '<tr><td colspan="4" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No audit events recorded for this tenant yet.</td></tr>';
    }

    errorEl?.classList.add('hidden');
    summaryEl?.classList.remove('hidden');
  } catch (e) {
    console.error('[TenantView] Failed to load tenant detail', e);
    errorEl?.classList.remove('hidden');
    if (subtitleEl) subtitleEl.textContent = 'Tenant could not be loaded.';
    showToast('Unable to load tenant details.');
  }
}