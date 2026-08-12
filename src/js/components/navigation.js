// Centralized Navigation State Manager — Phase 7
// Manages sidebar active item highlighting across all pages and focused detail routes.

export function initNavigation() {
  updateSidebarActiveState();
  window.addEventListener('popstate', updateSidebarActiveState);
}

export function updateSidebarActiveState() {
  const path = window.location.pathname.toLowerCase();
  
  let currentKey = 'index';
  if (path.includes('assessment-workspace.html') || path.includes('assessments.html') || path.includes('tos.html') || path.includes('exam-import.html') || path.includes('item-analysis.html')) {
    currentKey = 'assessments';
  } else if (path.includes('students.html') || path.includes('student.html')) {
    currentKey = 'students';
  } else if (path.includes('config.html') || path.includes('settings.html') || path.includes('app-config.html')) {
    currentKey = 'config';
  } else if (path.includes('analytics.html') || path.includes('reports.html')) {
    currentKey = 'analytics';
  } else if (path.includes('index.html') || path === '/' || path.endsWith('/')) {
    currentKey = 'index';
  }

  const navItems = document.querySelectorAll('[data-nav]');
  navItems.forEach(item => {
    const key = item.getAttribute('data-nav');
    const isCurrent = key === currentKey;

    if (isCurrent) {
      item.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20';
      const svg = item.querySelector('svg');
      if (svg) svg.setAttribute('class', 'w-5 h-5 text-brand-500');
    } else {
      item.className = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200';
      const svg = item.querySelector('svg');
      if (svg) svg.setAttribute('class', 'w-5 h-5 text-gray-500');
    }
  });
}
