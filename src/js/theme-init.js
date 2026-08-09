// src/js/theme-init.js - Embedded/imported for synchronous theme & layout state setup
(function () {
  const storedTheme = localStorage.getItem('darkMode');
  const isDark = storedTheme === 'true' || storedTheme === 'dark';
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  const sidebarCollapsed = localStorage.getItem('sidebarExpanded') === 'false';
  if (sidebarCollapsed) {
    document.documentElement.classList.add('sidebar-collapsed');
  }
})();
