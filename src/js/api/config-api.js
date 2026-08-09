import * as ApiClient from './api-client.js';

export async function getConfig() {
  return ApiClient.get('/config');
}

export async function saveConfig(configData) {
  return ApiClient.put('/config', configData);
}
