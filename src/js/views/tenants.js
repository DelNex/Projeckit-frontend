import { listTenants, createTenant } from '../api/admin-api.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../ui/toast.js';

function showTenantFeedback(message, isError = true) {
  const feedback = document.getElementById('tenant-form-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle('text-red-600', isError);
  feedback.classList.toggle('text-emerald-600', !isError);
}

export async function loadTenantTable() {
  const tbody = document.getElementById('admin-tenants-tbody');
  if (!tbody) return;
  try {
    const res = await listTenants();
    const tenants = res?.data || [];
    if (!tenants.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            No school tenants yet. Create the first one using the form.
          </td>
        </tr>
      `;
      return;
    }
    tbody.innerHTML = tenants.map((t) => {
      const name = escapeHTML(t.name || 'Unnamed tenant');
      const code = t.code ? escapeHTML(t.code) : '<span class="text-gray-400">—</span>';
      const status = t.isActive
        ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Active</span>'
        : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Inactive</span>';
      const created = escapeHTML(new Date(t.createdAt).toLocaleDateString() || '—');
      return `
        <tr class="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
          <td class="px-4 py-3 font-semibold text-gray-900 dark:text-white">${name}</td>
          <td class="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">${code}</td>
          <td class="px-4 py-3">${status}</td>
          <td class="px-4 py-3 text-gray-500 dark:text-gray-400">${created}</td>
          <td class="px-4 py-3 text-right">
            <a href="tenant.html?id=${encodeURIComponent(t.id)}" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition">
              Open
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.warn('[TenantsView] Tenants read failed', e);
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">Tenants offline or unavailable.</td></tr>';
  }
}

function initTenantForm() {
  const form = document.getElementById('admin-create-tenant-form');
  if (!form) return;
  const submitBtn = document.getElementById('tenant-create-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showTenantFeedback('');
    const name = document.getElementById('tenant-name')?.value.trim();
    const code = document.getElementById('tenant-code')?.value.trim();

    if (!name) {
      showTenantFeedback('Tenant name is required.');
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
    }

    try {
      await createTenant({ name, code });
      showTenantFeedback('Tenant created. Share the code with your teachers.', false);
      form.reset();
      await loadTenantTable();
      showToast('School tenant created.');
    } catch (error) {
      console.error('[TenantsView] Tenant creation failed', error);
      showTenantFeedback(error?.message || 'Failed to create tenant. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create tenant';
      }
    }
  });
}

export async function initTenantsView() {
  initTenantForm();
  await loadTenantTable();

  document.getElementById('btn-refresh-tenants')?.addEventListener('click', () => {
    loadTenantTable();
  });
}