import { showToast } from '../ui/toast.js';

const AUTH_PAGES = ['/login.html', '/register.html', '/forgot-password.html', '/reset-password.html'];

function isAuthPage() {
  const path = window.location.pathname.toLowerCase();
  return AUTH_PAGES.some((page) => path.endsWith(page));
}

export function initGlobalApiErrorHandler() {
  window.addEventListener('deped_api_error', (evt) => {
    const detail = evt?.detail;
    if (!detail || typeof detail !== 'object') return;

    const { status, message } = detail;
    if (status === 401 && !isAuthPage()) {
      showToast(message || 'Your session has expired. Please sign in again.');
      window.location.href = '/login.html';
      return;
    }

    if (status === 403) {
      showToast(message || 'Permission denied.');
      return;
    }

    if (status === 429) {
      showToast(message || 'Too many requests. Please try again later.');
      return;
    }

    if (status >= 500) {
      showToast(message || 'Server error. Please try again later.');
    }
  });
}
