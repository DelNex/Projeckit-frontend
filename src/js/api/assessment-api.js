import * as ApiClient from './api-client.js';

export function listAssessments(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.subjectId) params.set('subjectId', filters.subjectId);
  if (filters.sectionId) params.set('sectionId', filters.sectionId);
  const qs = params.toString();
  return ApiClient.get(`/assessments${qs ? '?' + qs : ''}`);
}

export function getAssessment(id) {
  return ApiClient.get(`/assessments/${id}`);
}

export function createAssessment(data) {
  return ApiClient.post('/assessments', data);
}

export function updateAssessmentStatus(id, status, version) {
  return ApiClient.patch(`/assessments/${id}/status`, { status, ...(version != null ? { version } : {}) });
}

export function reopenAssessment(id, reason) {
  return ApiClient.post(`/assessments/${id}/reopen`, { reason });
}

export function upsertAnswerKey(id, answers, changeReason) {
  return ApiClient.post(`/assessments/${id}/answer-key`, { answers, changeReason });
}

export function overrideScore(id, responseId, newScore, reason) {
  return ApiClient.post(`/assessments/${id}/score-override`, { responseId, newScore, reason });
}

export function getAttendance(id, page = 1, limit = 50) {
  return ApiClient.get(`/assessments/${id}/attendance?page=${page}&limit=${limit}`);
}

export function updateAttendance(id, records) {
  return ApiClient.put(`/assessments/${id}/attendance`, { records });
}

export function getResponses(id, page = 1, limit = 50) {
  return ApiClient.get(`/assessments/${id}/responses?page=${page}&limit=${limit}`);
}

export function submitScan(id, idempotencyKey, imageData, studentLrn) {
  return ApiClient.post(
    `/assessments/${id}/scan`,
    { imageData, studentLrn },
    { headers: { 'x-idempotency-key': idempotencyKey } },
  );
}

export function getVerificationQueue(id, page = 1, limit = 50) {
  return ApiClient.get(`/assessments/${id}/verification-queue?page=${page}&limit=${limit}`);
}

export function reviewVerificationItem(id, itemId, action, overrides, reason) {
  return ApiClient.post(`/assessments/${id}/verification-queue/${itemId}/review`, {
    action,
    overrides,
    reason,
  });
}

export function generateOmrForm(id) {
  return ApiClient.post(`/assessments/${id}/omr-form/generate`, {});
}

export function getOmrForm(id) {
  return ApiClient.get(`/assessments/${id}/omr-form`);
}

export function getOmrFormPrintUrl(id) {
  return `/api/assessments/${id}/omr-form/print`;
}

export function getOmrFormPrintHtml(id) {
  return ApiClient.getRawHtml(`/assessments/${id}/omr-form/print`);
}

export function getResultsSummary(id) {
  return ApiClient.get(`/assessments/${id}/results/summary`);
}

export function getStudentResults(id, page = 1, limit = 50, search = '') {
  const qs = new URLSearchParams({ page, limit, ...(search ? { search } : {}) }).toString();
  return ApiClient.get(`/assessments/${id}/results/students?${qs}`);
}

export function getItemAnalysis(id) {
  return ApiClient.get(`/assessments/${id}/results/items`);
}

export function getCompetencyAnalysis(id) {
  return ApiClient.get(`/assessments/${id}/results/competencies`);
}

export function getResultsExportCsvUrl(id) {
  return `/api/assessments/${id}/results/export/csv`;
}
