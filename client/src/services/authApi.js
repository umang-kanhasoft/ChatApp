import { api } from './api.js';

export const registerApi = async (payload) => {
  const response = await api.post('/auth/register', payload);
  return response.data.data;
};

export const loginApi = async (payload) => {
  const response = await api.post('/auth/login', payload);
  return response.data.data;
};

export const requestOtpApi = async (phone) => {
  const response = await api.post('/auth/otp/request', { phone });
  return response.data.data;
};

export const verifyOtpApi = async ({ phone, code }) => {
  const response = await api.post('/auth/otp/verify', { phone, code });
  return response.data.data;
};

export const requestEmailOtpByPhoneApi = async (phone) => {
  const response = await api.post('/auth/otp/email/request-by-phone', { phone });
  return response.data.data;
};

export const verifyEmailOtpByPhoneApi = async ({ phone, code }) => {
  const response = await api.post('/auth/otp/email/verify-by-phone', { phone, code });
  return response.data.data;
};

export const requestEmailOtpApi = async (email) => {
  const response = await api.post('/auth/otp/email/request', { email });
  return response.data.data;
};

export const verifyEmailOtpApi = async ({ email, code }) => {
  const response = await api.post('/auth/otp/email/verify', { email, code });
  return response.data.data;
};

export const meApi = async () => {
  const response = await api.get('/auth/me');
  return response.data.data;
};

export const logoutApi = async (refreshToken) => {
  await api.post('/auth/logout', { refreshToken });
};

export const subscribePushApi = async (subscription) => {
  const response = await api.post('/auth/push/subscribe', subscription);
  return response.data.data;
};

export const unsubscribePushApi = async (endpoint) => {
  const response = await api.post('/auth/push/unsubscribe', { endpoint });
  return response.data.data;
};

export const matchContactsApi = async (phones) => {
  const response = await api.post('/auth/contacts/match', { phones });
  return response.data.data;
};
