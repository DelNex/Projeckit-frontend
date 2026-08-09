export const NoData = {
  renderTableRow(cols = 1, title = 'No data available', message = 'No records found for the current selection.', linkText = '', linkHref = '') {
    const linkHtml = linkText ? `<p class="text-xs mt-1"><a href="${linkHref}" class="text-brand-500 hover:underline">${linkText}</a></p>` : '';
    return `
      <tr>
        <td colspan="${cols}" class="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
          <div class="flex flex-col items-center justify-center space-y-2">
            <div class="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center mb-1">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"></path></svg>
            </div>
            <p class="font-bold text-sm text-gray-900 dark:text-white">${title}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">${message}</p>
            ${linkHtml}
          </div>
        </td>
      </tr>
    `;
  },

  renderCard(title = 'No data available', message = 'No records found for the current selection.', linkText = '', linkHref = '') {
    const linkHtml = linkText ? `<a href="${linkHref}" class="text-sm text-brand-500 hover:underline">${linkText}</a>` : '';
    return `
      <div class="p-8 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 text-center space-y-3">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-500 mb-1">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"></path></svg>
        </div>
        <h3 class="text-base font-bold text-gray-900 dark:text-white">${title}</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">${message}</p>
        ${linkHtml}
      </div>
    `;
  }
};
