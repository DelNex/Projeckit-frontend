import { post, get } from './api-client.js';

export async function sendAiChat(message, context = {}) {
  return post('/ai/chat', { message, context });
}

export async function getAiInfo() {
  return get('/ai/info');
}

export default { sendAiChat, getAiInfo };