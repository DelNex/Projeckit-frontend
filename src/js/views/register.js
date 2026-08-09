import { AuthService } from '../auth-service.js';
import { showToast } from '../ui/toast.js';

function setFormLoading(isLoading) {
  const button = document.getElementById('register-submit');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Submitting...' : 'Create account';
}

function showFeedback(message, isError = true) {
  const feedback = document.getElementById('register-feedback');
  if (!feedback) {
    showToast(message);
    return;
  }
  feedback.textContent = message;
  feedback.classList.toggle('text-red-600', isError);
  feedback.classList.toggle('text-emerald-600', !isError);
}

export function initRegisterView() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback('');

    const displayName = document.getElementById('register-name')?.value.trim();
    const email = document.getElementById('register-email')?.value.trim();
    const password = document.getElementById('register-password')?.value;
    const recommendationCode = document.getElementById('register-code')?.value.trim();
    const tenantCode = document.getElementById('register-tenant-code')?.value.trim();

    if (!displayName || !email || !password) {
      showFeedback('Name, email, and password are required.');
      return;
    }

    setFormLoading(true);
    try {
      await AuthService.register({ displayName, email, password, recommendationCode, tenantCode });
      showFeedback('Account created. Waiting for admin approval.', false);
      showToast('Account created. Waiting for admin approval.');
      form.reset();
    } catch (error) {
      console.error('[RegisterView] Registration failed', error);
      const serverMessage = error?.message && error?.message !== 'Request failed' ? error.message : null;
      showFeedback(serverMessage || 'Registration failed. Please try again.');
      showToast(serverMessage || 'Registration failed. Please try again.');
    } finally {
      setFormLoading(false);
    }
  });
}
