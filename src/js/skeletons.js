// Reusable Skeleton Component Builder for Project KIT
export class SkeletonBuilder {
  static renderKpiCards(count = 4) {
    return Array(count).fill(0).map(() => `
      <div class="p-6 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm animate-pulse">
        <div class="flex items-center justify-between mb-4">
          <div class="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div class="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div class="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
        <div class="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    `).join('');
  }

  static renderTableRows(rows = 5, columns = 6) {
    return Array(rows).fill(0).map(() => `
      <tr class="animate-pulse border-b border-gray-200 dark:border-gray-800">
        ${Array(columns).fill(0).map(() => `
          <td class="px-4 py-3">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </td>
        `).join('')}
      </tr>
    `).join('');
  }

  static renderChartPlaceholder(title = "Loading Performance Analytics...") {
    return `
      <div class="p-6 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm animate-pulse space-y-4">
        <div class="flex justify-between items-center mb-4">
          <div class="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div class="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div class="h-72 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">${title}</span>
        </div>
      </div>
    `;
  }

  static renderFormSkeleton() {
    return `
      <div class="p-6 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm animate-pulse space-y-4">
        <div class="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div class="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div class="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    `;
  }
}
