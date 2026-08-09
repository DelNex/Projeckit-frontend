// DOM Partial Update and ApexCharts Instance Patching Helper
import { SkeletonBuilder } from './skeletons.js';

export class DomPatcher {
  static async updateTable({ containerId, fetchFn, renderRowFn, columns = 6, rowCount = 5 }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = SkeletonBuilder.renderTableRows(rowCount, columns);

    try {
      const data = await fetchFn();

      if (!data || data.length === 0) {
        container.innerHTML = `
          <tr>
            <td colspan="${columns}" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              <div class="flex flex-col items-center justify-center">
                <svg class="w-12 h-12 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                </svg>
                <p class="text-base font-medium">No records found</p>
                <p class="text-sm text-gray-400">Try adjusting your active section or quarter filters.</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      container.innerHTML = data.map((item, index) => renderRowFn(item, index)).join('');
    } catch (error) {
      console.error('[DomPatcher Error]:', error);
      container.innerHTML = `
        <tr>
          <td colspan="${columns}" class="px-4 py-6 text-center text-rose-600 bg-rose-50 dark:bg-rose-900/20">
            <p class="font-medium">Failed to load academic data.</p>
            <button onclick="window.location.reload()" class="mt-2 text-xs underline">Retry</button>
          </td>
        </tr>
      `;
    }
  }
}
