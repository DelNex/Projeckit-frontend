// Universal Excel-Like Data Table & Keyboard Grid Engine for Project KIT
export class GridEngine {
  constructor(options) {
    this.tableId = options.tableId;
    this.containerId = options.containerId;
    this.bulkBarId = options.bulkBarId;
    this.data = options.data || [];
    this.columns = options.columns || [];
    this.onSaveCell = options.onSaveCell || null;
    this.onSelectionChange = options.onSelectionChange || null;
    this.selectedIds = new Set();

    this.init();
  }

  init() {
    this.bindGlobalKeyboardNav();
  }

  bindGlobalKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      const activeElement = document.activeElement;
      if (!activeElement || !activeElement.classList.contains('kit-grid-cell')) return;

      const currentTd = activeElement.closest('td');
      const currentTr = activeElement.closest('tr');
      if (!currentTd || !currentTr) return;

      const cellIndex = Array.from(currentTr.children).indexOf(currentTd);
      const rowIndex = Array.from(currentTr.parentNode.children).indexOf(currentTr);

      if (e.key === 'Tab') {
        e.preventDefault();
        const targetTd = e.shiftKey ? currentTd.previousElementSibling : currentTd.nextElementSibling;
        const input = targetTd?.querySelector('.kit-grid-cell');
        if (input) input.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const nextTr = currentTr.nextElementSibling;
        if (nextTr) {
          const targetTd = nextTr.children[cellIndex];
          const input = targetTd?.querySelector('.kit-grid-cell');
          if (input) input.focus();
        }
      } else if (e.key === 'Escape') {
        activeElement.blur();
      }
    });
  }

  toggleSelectAll(isChecked) {
    if (isChecked) {
      this.data.forEach(item => this.selectedIds.add(item.id || item.lrn));
    } else {
      this.selectedIds.clear();
    }
    this.updateBulkActionBar();
  }

  toggleSelectRow(id, isChecked) {
    if (isChecked) {
      this.selectedIds.add(id);
    } else {
      this.selectedIds.delete(id);
    }
    this.updateBulkActionBar();
  }

  updateBulkActionBar() {
    const bulkBar = document.getElementById(this.bulkBarId);
    const countElem = document.getElementById('selected-row-count');

    if (!bulkBar) return;

    if (this.selectedIds.size > 0) {
      if (countElem) countElem.textContent = `${this.selectedIds.size} row(s) selected`;
      bulkBar.classList.remove('hidden', 'translate-y-20');
      bulkBar.classList.add('translate-y-0');
    } else {
      bulkBar.classList.add('translate-y-20');
      setTimeout(() => bulkBar.classList.add('hidden'), 300);
    }

    if (this.onSelectionChange) {
      this.onSelectionChange(Array.from(this.selectedIds));
    }
  }
}
