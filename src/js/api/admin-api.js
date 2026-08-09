import * as ApiClient from './api-client.js';

export async function getPendingUsers() {
  return ApiClient.get('/admin/pending-users');
}

export async function approveTeacher(id) {
  return ApiClient.post(`/admin/approve/${encodeURIComponent(id)}`);
}

export async function rejectTeacher(id) {
  return ApiClient.post(`/admin/reject/${encodeURIComponent(id)}`);
}

export async function getAuditLogs() {
  return ApiClient.get('/admin/audit');
}

export async function suspendUser(id) {
  return ApiClient.post(`/admin/suspend/${encodeURIComponent(id)}`);
}

export async function reactivateUser(id) {
  return ApiClient.post(`/admin/reactivate/${encodeURIComponent(id)}`);
}

export async function listTenants() {
  return ApiClient.get('/admin/tenants');
}

export async function getTenantDetail(id) {
  return ApiClient.get(`/admin/tenants/${encodeURIComponent(id)}`);
}

export async function createTenant(payload) {
  return ApiClient.post('/admin/tenants', payload);
}

export async function getAppSettings() {
  return ApiClient.get('/admin/app-settings');
}

export async function updateAppSettings(payload) {
  return ApiClient.put('/admin/app-settings', payload);
}
