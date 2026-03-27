import { api } from './api.js';

export const listCallHistoryApi = async () => {
  const response = await api.get('/calls/history');
  return response.data.data;
};

export const listIceServersApi = async () => {
  const response = await api.get('/calls/ice-servers');
  return response.data.data;
};

export const getActiveGroupCallApi = async (conversationId) => {
  const response = await api.get(`/calls/group/active/${conversationId}`);
  return response.data.data;
};
