import { api } from './api.js';

export const listStatusFeedApi = async () => {
  const response = await api.get('/status');
  return response.data.data;
};

export const createStatusApi = async (payload) => {
  const response = await api.post('/status', payload);
  return response.data.data;
};

export const uploadStatusMediaApi = async ({ file, caption = '', privacy = 'all' }) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('caption', caption);
  formData.append('privacy', privacy);

  const response = await api.post('/status/media', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data.data;
};

export const markStatusViewedApi = async (statusId) => {
  const response = await api.post(`/status/${statusId}/view`);
  return response.data.data;
};

export const reactStatusApi = async ({ statusId, emoji }) => {
  const response = await api.post(`/status/${statusId}/react`, { emoji });
  return response.data.data;
};

export const deleteStatusApi = async (statusId) => {
  const response = await api.delete(`/status/${statusId}`);
  return response.data.data;
};
