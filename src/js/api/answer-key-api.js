import * as ApiClient from './api-client.js';

export async function getAnswerKeys() {
  return ApiClient.get('/answer-keys');
}

export async function getAnswerKey(id) {
  return ApiClient.get(`/answer-keys/${id}`);
}

export async function upsertAnswerKey(dto) {
  return ApiClient.post('/answer-keys', dto);
}

export async function deleteAnswerKey(id) {
  return ApiClient.del(`/answer-keys/${id}`);
}

export async function gradeAnswers(dto) {
  return ApiClient.post('/answer-keys/grade', dto);
}