import * as ApiClient from './api-client.js';

// Returns normalized response rows: [{ configId, lrn, sectionName, subjectId, term, response, createdAt, updatedAt }, ...]
export async function listResponses() {
  return ApiClient.get('/config/responses');
}

// Upsert a single normalized response row: { lrn, sectionName, subjectId, term, response }
export async function upsertResponseRow(payload) {
  return ApiClient.put('/config/responses/row', payload);
}

// Bulk upsert multiple normalized response rows
export async function bulkUpsertResponses(rows) {
  // rows: Array<{ lrn, sectionName, subjectId?, term, response }>
  return ApiClient.put('/config/responses/bulk', { rows });
}

// Delete all responses for section + term (backend should delete matching rows)
export async function deleteResponse(sectionName, term) {
  return ApiClient.del(`/config/responses/${encodeURIComponent(sectionName)}/${encodeURIComponent(term)}`);
}
