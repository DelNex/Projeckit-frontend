import * as ApiClient from './api-client.js';

export async function listRecommendations() {
  return ApiClient.get('/recommendation');
}

export async function createRecommendation(payload) {
  return ApiClient.post('/recommendation', payload);
}

export async function validateRecommendation(code) {
  return ApiClient.post('/recommendation/validate', { code });
}

export async function disableRecommendation(id) {
  return ApiClient.post(`/recommendation/${encodeURIComponent(id)}/disable`);
}

export async function deleteRecommendation(id) {
  return ApiClient.del(`/recommendation/${encodeURIComponent(id)}`);
}
