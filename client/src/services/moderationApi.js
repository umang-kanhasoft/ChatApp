import { api } from './api.js';

export const listBlockedUsersApi = async () => {
  const response = await api.get('/users/blocked');
  return response.data.data;
};

export const blockUserApi = async (userId) => {
  const response = await api.post(`/users/${userId}/block`);
  return response.data.data;
};

export const unblockUserApi = async (userId) => {
  const response = await api.delete(`/users/${userId}/unblock`);
  return response.data.data;
};

export const reportTargetApi = async ({ targetType, targetId, reason, details }) => {
  const response = await api.post('/moderation/reports', {
    targetType,
    targetId,
    reason,
    details,
  });

  return response.data.data;
};
