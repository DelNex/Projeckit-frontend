import * as ApiClient from './api-client.js';

export async function getCompetencies(filters = {}) {
  const query = Object.entries(filters)
    .filter(([_, value]) => value != null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const endpoint = '/tos/competencies' + (query ? `?${query}` : '');
  return ApiClient.get(endpoint);
}

export async function getTosDocuments() {
  return ApiClient.get('/tos/documents');
}

export async function getTosDocument(id) {
  return ApiClient.get(`/tos/documents/${id}`);
}

export async function upsertTosDocument(doc) {
  return ApiClient.post('/tos/documents', doc);
}

export async function deleteTosDocument(id) {
  return ApiClient.del(`/tos/documents/${id}`);
}
