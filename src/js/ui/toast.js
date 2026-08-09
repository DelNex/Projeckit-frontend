import { escapeHTML } from '../utils.js';

const TOAST_ID = 'app-toast';
const DEFAULT_DURATION_MS = 4000;

export function showToast(message, { duration = DEFAULT_DURATION_MS } = {}) {
  if (!message) return;
  const toast = document.getElementById(TOAST_ID);
  if (!toast) {
    window.alert(message);
    return;
  }

  toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
  toast.classList.remove('hidden', 'translate-y-10', 'opacity-0');
  toast.classList.add('opacity-100');

  window.clearTimeout(toast._hideTimeout);
  toast._hideTimeout = window.setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    toast._hideTimeout = window.setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, duration);
}
