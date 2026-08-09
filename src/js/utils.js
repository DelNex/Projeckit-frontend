/**
 * Escapes HTML special characters in a string to prevent XSS attacks.
 * @param {string | null | undefined} str The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} The new debounced function.
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Resolves a canonical section ID (e.g., "11-STEM-A") into a human-readable
 * display name (e.g., "Grade 11 - STEM A") using the master config.
 * @param {string} sectionId The canonical section identifier.
 * @param {object} config The full ConfigStore object.
 * @returns {string} The formatted display name or the original ID as a fallback.
 */
export function resolveSectionName(sectionId, config) {
  if (!sectionId || !config || !Array.isArray(config.sections)) {
    return sectionId || '';
  }

  const sectionData = config.sections.find(s => s.name === sectionId);
  if (!sectionData) return sectionId; // Fallback to ID if not found

  const parts = sectionData.name.split('-'); // e.g., ['11', 'STEM', 'A']
  return `${sectionData.grade} - ${sectionData.strand} ${parts[2] || ''}`.trim();
}

/**
 * Safely returns the selected value of a select element or an empty string when
 * the element is not present or disabled. Use this instead of repeating
 * ad-hoc checks across views.
 * @param {HTMLSelectElement|null} selectEl
 * @returns {string}
 */
export function selectValueOrEmpty(selectEl) {
  try {
    if (!selectEl) return '';
    if (selectEl.disabled) return '';
    return selectEl.value || '';
  } catch (e) {
    return '';
  }
}

/**
 * Ensures a non-intrusive "Add sections" quick-link appears below the given
 * select element when it is disabled. Uses absolute positioning to avoid
 * affecting parent flex layouts. When the select is enabled, the helper link
 * is removed.
 * @param {HTMLSelectElement} selectEl
 */
export function ensureAddSectionsLink(selectEl) {
  if (!selectEl || !selectEl.parentNode) return;
  const linkId = `${selectEl.id}-add-section-link`;
  const existing = document.getElementById(linkId);

  if (selectEl.disabled) {
    if (existing) return; // already present

    // Use a block-level wrapper inserted after the select to avoid absolute positioning
    const wrapper = document.createElement('div');
    wrapper.id = linkId;
    wrapper.className = 'mt-1 text-xs w-full overflow-hidden';

    const anchor = document.createElement('a');
    anchor.href = 'config.html#sections';
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = 'inline-block w-full truncate text-brand-500 hover:underline';
    anchor.textContent = 'Add sections in School Settings';
    anchor.setAttribute('title', 'Open School Settings to add sections (opens in new tab)');

    wrapper.appendChild(anchor);

    // Insert after the select element (preserve layout and avoid overlay issues)
    if (selectEl.nextSibling) selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
    else selectEl.parentNode.appendChild(wrapper);
  } else {
    if (existing) existing.remove();
  }
}
