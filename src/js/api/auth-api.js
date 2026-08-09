import * as ApiClient from './api-client.js';

export async function login(payload) {
  if (!payload || !payload.name || !payload.password) {
    throw { status: 400, message: 'Name and password are required' };
  }

  await ApiClient.fetchCsrfToken();
  return ApiClient.post('/auth/login', payload);
}

export async function register(payload) {
  const name = payload?.displayName || payload?.name;
  if (!payload || !name || !payload.email || !payload.password) {
    throw { status: 400, message: 'Name, email, and password are required' };
  }

  await ApiClient.fetchCsrfToken();
  return ApiClient.post('/auth/register', payload);
}

export async function logout() {
  await ApiClient.fetchCsrfToken();
  return ApiClient.post('/auth/logout');
}

export async function getSession() {
  return ApiClient.get('/auth/session');
}

export async function forgotPassword(email) {
  if (!email) {
    throw { status: 400, message: 'Email is required' };
  }

  await ApiClient.fetchCsrfToken();
  return ApiClient.post('/auth/forgot-password', { email });
}

export async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw { status: 400, message: 'Token and new password are required' };
  }

  await ApiClient.fetchCsrfToken();
  return ApiClient.post('/auth/reset-password', { token, newPassword });
}

export async function changePassword(currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw { status: 400, message: 'Current and new passwords are required' };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw { status: 400, message: 'New password must be at least 6 characters' };
  }

  await ApiClient.fetchCsrfToken();
  return ApiClient.post('/auth/change-password', { currentPassword, newPassword });
}

export async function updateProfile(displayName) {
  if (!displayName || !String(displayName).trim()) {
    throw { status: 400, message: 'Display name is required' };
  }

  await ApiClient.fetchCsrfToken();
  return ApiClient.patch('/auth/profile', { displayName: String(displayName).trim() });
}
