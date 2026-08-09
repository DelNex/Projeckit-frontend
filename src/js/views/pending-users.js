import { getPendingUsers, approveTeacher, rejectTeacher, suspendUser, reactivateUser } from '../api/admin-api.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../ui/toast.js';

function renderStatusBadge(status) {
  const normalized = String(status || 'PENDING').trim().toUpperCase();
  if (normalized === 'PENDING') {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
      <span class="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
      Pending Review
    </span>`;
  } else if (normalized === 'APPROVED' || normalized === 'ACTIVE') {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
      Active Access
    </span>`;
  } else if (normalized === 'SUSPENDED') {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
      <span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
      Suspended
    </span>`;
  }
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">${escapeHTML(status)}</span>`;
}

function renderPendingRow(user) {
  const statusHtml = renderStatusBadge(user.status);
  const createdAt = escapeHTML(new Date(user.createdAt).toLocaleString() || 'Unknown');
  const actionButtons = [];

  const rawStatus = String(user.status || '').toUpperCase();

  if (rawStatus === 'PENDING') {
    actionButtons.push(
      `<button data-action="approve" data-user-id="${user.id}" class="approve-button inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 shadow-xs disabled:cursor-not-allowed disabled:opacity-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Approve</button>`,
      `<button data-action="reject" data-user-id="${user.id}" class="reject-button inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 shadow-xs disabled:cursor-not-allowed disabled:opacity-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>Reject</button>`,
    );
  } else if (rawStatus === 'SUSPENDED') {
    actionButtons.push(
      `<button data-action="reactivate" data-user-id="${user.id}" class="reactivate-button inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 shadow-xs disabled:cursor-not-allowed disabled:opacity-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Reactivate</button>`,
    );
  } else if (rawStatus === 'APPROVED' || rawStatus === 'ACTIVE') {
    actionButtons.push(
      `<button data-action="suspend" data-user-id="${user.id}" class="suspend-button inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 shadow-xs disabled:cursor-not-allowed disabled:opacity-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>Suspend</button>`,
    );
  }

  return `
    <tr class="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
      <td class="px-4 py-3 font-bold text-gray-900 dark:text-white">${escapeHTML(user.displayName || user.email)}</td>
      <td class="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono">${escapeHTML(user.email)}</td>
      <td class="px-4 py-3 font-mono text-gray-500 dark:text-gray-400">${createdAt}</td>
      <td class="px-4 py-3">${statusHtml}</td>
      <td class="px-4 py-3 space-x-2">${actionButtons.join('')}</td>
    </tr>
  `;
}

function setActionButtonsDisabled(container, disabled) {
  const buttons = container.querySelectorAll('button[data-action]');
  buttons.forEach((button) => {
    button.disabled = disabled;
  });
}

export async function initPendingUsersView() {
  const tableBody = document.getElementById('pending-users-table-body');
  const searchInput = document.getElementById('search-pending-teachers');
  const statusFilter = document.getElementById('filter-pending-status');
  if (!tableBody) return;

  let allUsers = [];

  const filterAndRender = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const filterVal = (statusFilter?.value || 'ALL').toUpperCase();

    const filtered = allUsers.filter((user) => {
      const nameMatch = (user.displayName || '').toLowerCase().includes(query) || (user.email || '').toLowerCase().includes(query);
      const userStatus = String(user.status || 'PENDING').toUpperCase();
      const statusMatch = filterVal === 'ALL' || userStatus === filterVal;
      return nameMatch && statusMatch;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">No matching teacher registrations found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(renderPendingRow).join('');
  };

  const refreshUsers = async () => {
    tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">Loading teacher registrations…</td></tr>';
    try {
      const response = await getPendingUsers();
      allUsers = response?.data || [];
      filterAndRender();
    } catch (error) {
      console.error('[PendingUsersView] Failed to load pending users', error);
      tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-red-600 dark:text-red-400">Unable to load pending teachers.</td></tr>';
      showToast('Unable to load pending teachers. Please try again later.');
    }
  };

  searchInput?.addEventListener('input', filterAndRender);
  statusFilter?.addEventListener('change', filterAndRender);

  tableBody.addEventListener('click', async (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const userId = target.getAttribute('data-user-id');
    if (!action || !userId) return;

    const row = target.closest('tr');
    setActionButtonsDisabled(row, true);

    try {
      let message = '';
      if (action === 'approve') {
        await approveTeacher(userId);
        message = 'Teacher approved successfully.';
      } else if (action === 'reject') {
        await rejectTeacher(userId);
        message = 'Teacher rejected successfully.';
      } else if (action === 'suspend') {
        await suspendUser(userId);
        message = 'Teacher suspended successfully.';
      } else if (action === 'reactivate') {
        await reactivateUser(userId);
        message = 'Teacher reactivated successfully.';
      }

      showToast(message);
      await refreshUsers();
    } catch (error) {
      console.error('[PendingUsersView] Action failed', action, error);
      showToast('Action failed. Please try again.');
    } finally {
      setActionButtonsDisabled(row, false);
    }
  });

  await refreshUsers();
}
