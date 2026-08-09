import { listRecommendations, createRecommendation, deleteRecommendation } from '../api/recommendation-api.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../ui/toast.js';

function renderRecommendationRow(rec) {
  const createdDate = escapeHTML(new Date(rec.createdAt).toLocaleString() || 'Unknown');
  const expires = rec.expiresAt ? escapeHTML(new Date(rec.expiresAt).toLocaleString()) : 'Never';
  const used = rec.usedAt ? `Yes (${escapeHTML(new Date(rec.usedAt).toLocaleString())})` : 'No';

  return `
    <tr class="border-b border-gray-100 dark:border-gray-800">
      <td class="px-4 py-3 font-mono">${escapeHTML(rec.code)}</td>
      <td class="px-4 py-3">${createdDate}</td>
      <td class="px-4 py-3">${expires}</td>
      <td class="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">${used}</td>
      <td class="px-4 py-3">
        <button data-recommendation-id="${rec.id}" class="delete-button inline-flex items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">
          Delete
        </button>
      </td>
    </tr>
  `;
}

function setFormLoading(isLoading) {
  const button = document.getElementById('recommendation-create-button');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Creating…' : 'Create recommendation';
}

export async function initRecommendationsView() {
  const form = document.getElementById('recommendation-create-form');
  const tableBody = document.getElementById('recommendations-table-body');
  const expirationInput = document.getElementById('recommendation-expiration');
  if (!tableBody || !form || !expirationInput) return;

  const refreshRecommendations = async () => {
    tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading recommendation codes…</td></tr>';
    try {
      const response = await listRecommendations();
      const items = response?.data || [];
      if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No recommendation codes available.</td></tr>';
        return;
      }
      tableBody.innerHTML = items.map(renderRecommendationRow).join('');
    } catch (error) {
      console.error('[RecommendationsView] Failed to load recommendations', error);
      tableBody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-red-600 dark:text-red-400">Unable to load recommendation codes.</td></tr>';
      showToast('Unable to load recommendation codes. Please try again later.');
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormLoading(true);

    const expiresAt = expirationInput.value ? new Date(expirationInput.value).toISOString() : undefined;

    try {
      await createRecommendation({ expiresAt });
      showToast('Recommendation code created.');
      expirationInput.value = '';
      await refreshRecommendations();
    } catch (error) {
      console.error('[RecommendationsView] Create recommendation failed', error);
      showToast('Unable to create recommendation code. Please try again.');
    } finally {
      setFormLoading(false);
    }
  });

  tableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-recommendation-id]');
    if (!button) return;

    const id = button.getAttribute('data-recommendation-id');
    if (!id) return;

    button.disabled = true;
    try {
      await deleteRecommendation(id);
      showToast('Recommendation code deleted.');
      await refreshRecommendations();
    } catch (error) {
      console.error('[RecommendationsView] Delete recommendation failed', error);
      showToast('Unable to delete recommendation code. Please try again.');
    } finally {
      button.disabled = false;
    }
  });

  await refreshRecommendations();
}
