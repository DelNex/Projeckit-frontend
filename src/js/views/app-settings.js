import { AppSettingsStore } from '../stores/app-settings-store.js';
import { showToast } from '../ui/toast.js';

function buildBandRows(container, bands) {
  container.innerHTML = '';
  (bands || []).forEach((band, index) => {
    const row = document.createElement('div');
    row.className = 'band-row flex items-center gap-3';
    row.innerHTML = `
      <span class="w-5 text-gray-400 dark:text-gray-500 font-semibold">${index + 1}.</span>
      <input type="text" class="band-label w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:border-brand-500" value="${escapeHTML(String(band.label || ''))}" placeholder="Classification label" />
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-xs font-bold text-gray-500 dark:text-gray-400">%</span>
        <input type="number" min="0" max="100" step="0.01" class="band-min w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-semibold text-right focus:outline-none focus:border-brand-500" value="${band.min ?? 0}" />
      </div>
      <button type="button" class="btn-remove-band shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition" title="Remove band">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    `;
    container.appendChild(row);
  });
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initAppSettingsView() {
  console.log('[Project KIT] Initializing App Settings View');

  const settings = AppSettingsStore.get();
  const syInput = document.getElementById('cfg-school-year');
  const termSelect = document.getElementById('cfg-active-term');
  const mpsInput = document.getElementById('cfg-mps-passing');
  const bandsContainer = document.getElementById('bands-container');
  const btnAddBand = document.getElementById('btn-add-band');
  const schoolNameInput = document.getElementById('cfg-school-name');
  const schoolAddressInput = document.getElementById('cfg-school-address');
  const saveBtn = document.getElementById('btn-save-master-config');
  const statusEl = document.getElementById('settings-save-status');

  if (syInput) syInput.value = settings.academicPeriod.schoolYear || '2025–2026';
  if (termSelect) termSelect.value = settings.academicPeriod.term || 'First Quarter';
  if (mpsInput) mpsInput.value = settings.standards.mpsPassing ?? 75;
  if (schoolNameInput) schoolNameInput.value = settings.school.name || '';
  if (schoolAddressInput) schoolAddressInput.value = settings.school.address || '';
  if (bandsContainer) buildBandRows(bandsContainer, settings.standards.bands);

  btnAddBand?.addEventListener('click', () => {
    if (!bandsContainer) return;
    const current = Array.from(bandsContainer.querySelectorAll('.band-row')).map(collectBand);
    current.push({ label: '', min: 0 });
    buildBandRows(bandsContainer, current);
    bandsContainer.querySelectorAll('.band-row').forEach(attachBandRowListeners);
  });

  if (bandsContainer) {
    bandsContainer.querySelectorAll('.band-row').forEach(attachBandRowListeners);
  }

  function attachBandRowListeners(row) {
    row.querySelector('.btn-remove-band')?.addEventListener('click', () => {
      const remaining = Array.from(bandsContainer.querySelectorAll('.band-row')).filter((r) => r !== row);
      if (remaining.length === 0) return;
      buildBandRows(bandsContainer, remaining.map(collectBand));
      bandsContainer.querySelectorAll('.band-row').forEach(attachBandRowListeners);
    });
  }

  function collectBand(row) {
    return {
      label: row.querySelector('.band-label')?.value || '',
      min: Number(row.querySelector('.band-min')?.value) || 0,
    };
  }

  saveBtn?.addEventListener('click', async () => {
    const bandRows = bandsContainer ? Array.from(bandsContainer.querySelectorAll('.band-row')).map(collectBand) : settings.standards.bands;
    const payload = {
      academicPeriod: {
        schoolYear: syInput?.value?.trim() || settings.academicPeriod.schoolYear,
        term: termSelect?.value || settings.academicPeriod.term,
      },
      standards: {
        mpsPassing: Number(mpsInput?.value) || 0,
        bands: bandRows,
      },
      school: {
        name: schoolNameInput?.value?.trim() || settings.school.name,
        address: schoolAddressInput?.value?.trim() || settings.school.address,
      },
    };

    saveBtn.disabled = true;
    try {
      const result = await AppSettingsStore.update(payload);
      if (statusEl) {
        statusEl.textContent = result?.success ? 'App settings saved.' : 'Save failed.';
        statusEl.className = `ml-4 text-sm ${result?.success ? 'text-emerald-600' : 'text-rose-600'}`;
      }
      if (result?.success) showToast('App settings saved.');
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = 'Save failed - please try again.';
        statusEl.className = 'ml-4 text-sm text-rose-600';
      }
    } finally {
      saveBtn.disabled = false;
      if (statusEl) {
        setTimeout(() => {
          statusEl.textContent = '';
        }, 4000);
      }
    }
  });
}
