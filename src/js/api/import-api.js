import * as ApiClient from './api-client.js';

export async function getImports(limit = 100) {
  return ApiClient.get(`/imports?limit=${limit}`);
}

export async function addImport(entry) {
  return ApiClient.post('/imports', entry);
}