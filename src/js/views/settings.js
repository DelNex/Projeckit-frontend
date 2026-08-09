import * as AuthApi from '../api/auth-api.js';
import { ConfigStore } from '../stores/config-store.js';
import { AppSettingsStore } from '../stores/app-settings-store.js';
import { AuthService } from '../auth-service.js';

function setStatus(el, text, ok) {
  if (!el) return;
  el.textContent = text;
  el.className = `text-sm ${ok === false ? 'text-rose-600' : 'text-emerald-600'}`;
}

export function initSettingsView() {
  console.log('[Project KIT] Initializing Settings View');

  const profile = ConfigStore.get()?.userProfile || {};
  const nameInput = document.getElementById('display-name-input');
  const emailInput = document.getElementById('profile-email-input');
  const profileStatus = document.getElementById('profile-save-status');

  if (nameInput) nameInput.value = profile.name || profile.displayName || '';
  if (emailInput) emailInput.value = profile.email || '';

  const roYear = document.getElementById('ro-school-year');
  const roTerm = document.getElementById('ro-active-term');
  const roMps = document.getElementById('ro-mps-passing');
  const roSchool = document.getElementById('ro-school-name');
  const settings = AppSettingsStore.get();
  if (roYear) roYear.textContent = settings.academicPeriod.schoolYear || '-';
  if (roTerm) roTerm.textContent = settings.academicPeriod.term || '-';
  if (roMps) roMps.textContent = `${settings.standards.mpsPassing ?? 75}% MPS`;
  if (roSchool) roSchool.textContent = settings.school.name || '-';

  document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    const displayName = nameInput?.value?.trim();
    if (!displayName) {
      setStatus(profileStatus, 'Display name is required.', false);
      return;
    }
    try {
      const result = await AuthApi.updateProfile(displayName);
      if (result?.success) {
        ConfigStore.saveLocal({ ...(ConfigStore.get() || {}), userProfile: { ...profile, name: displayName } });
        setStatus(profileStatus, 'Profile updated.');
      } else {
        setStatus(profileStatus, 'Update failed.', false);
      }
    } catch (e) {
      setStatus(profileStatus, e?.message || 'Update failed - please try again.', false);
    }
  });

  document.getElementById('btn-change-password')?.addEventListener('click', async () => {
    const current = document.getElementById('pwd-current')?.value;
    const next = document.getElementById('pwd-new')?.value;
    const confirm = document.getElementById('pwd-confirm')?.value;
    const status = document.getElementById('password-save-status');

    if (!current || !next) {
      setStatus(status, 'Please fill in both password fields.', false);
      return;
    }
    if (next !== confirm) {
      setStatus(status, 'New passwords do not match.', false);
      return;
    }
    if (String(next).length < 6) {
      setStatus(status, 'New password must be at least 6 characters.', false);
      return;
    }
    try {
      const result = await AuthApi.changePassword(current, next);
      if (result?.success) {
        setStatus(status, 'Password changed. Please sign in again.');
        await AuthService.logout().catch(() => {});
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 1200);
      } else {
        setStatus(status, 'Change failed.', false);
      }
    } catch (e) {
      const message = e?.status === 400 ? (e?.message || 'Current password is incorrect.') : 'Could not change password.';
      setStatus(status, message, false);
    }
  });
}