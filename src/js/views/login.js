import { AuthService } from '../auth-service.js';
import { showToast } from '../ui/toast.js';

function setFormLoading(isLoading) {
  const button = document.getElementById('login-submit');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Signing in...' : 'Sign in';
}

function showFeedback(message, isError = true) {
  const feedback = document.getElementById('login-feedback');
  if (!feedback) {
    showToast(message);
    return;
  }
  feedback.textContent = message;
  feedback.classList.toggle('text-red-600', isError);
  feedback.classList.toggle('text-emerald-600', !isError);
}

export function initLoginView() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback('');

    const name = document.getElementById('login-name')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    if (!name || !password) {
      showFeedback('Please enter your email or username and password.');
      return;
    }

    setFormLoading(true);
    try {
      await AuthService.login({ name, password });
      window.location.href = '/index.html';
    } catch (error) {
      console.error('[LoginView] Login failed', error);
      const message = error?.message || 'Invalid login credentials';
      showFeedback('Incorrect email/username or password. Please try again.');
      showToast(message);
    } finally {
      setFormLoading(false);
    }
  });
}
