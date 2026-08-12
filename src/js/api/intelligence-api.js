import * as ApiClient from './api-client.js';

export function getAssessmentWeaknesses(id) {
  return ApiClient.get(`/assessments/${id}/intelligence/weaknesses`);
}

export function generateRemediationPlan(id, studentId, competencyName) {
  return ApiClient.post(`/assessments/${id}/remediation/generate`, { studentId, competencyName });
}

export function reviewRemediationPlan(planId, action, editedPayload = null, rejectionReason = '') {
  return ApiClient.post(`/intelligence/remediation/${planId}/review`, { action, editedPayload, rejectionReason });
}

export function assignRemediationPlan(planId) {
  return ApiClient.post(`/intelligence/remediation/${planId}/assign`, {});
}

export function submitStudentPractice(planId, answers) {
  return ApiClient.post(`/intelligence/remediation/${planId}/submit`, { answers });
}

export function generateReassessmentProposal(planId) {
  return ApiClient.post(`/intelligence/remediation/${planId}/reassessment/proposal`, {});
}

export function approveAndCreateReassessment(proposalId, editedQuestions = null) {
  return ApiClient.post(`/intelligence/reassessment/${proposalId}/approve`, { editedQuestions });
}

export function getStudentProgressTimeline(studentId) {
  return ApiClient.get(`/intelligence/students/${studentId}/progress`);
}
