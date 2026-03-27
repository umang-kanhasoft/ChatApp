import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SESSION_INVALID_CODES = new Set(['AUTH_INVALID', 'AUTH_REQUIRED', 'TOKEN_REUSED']);

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 60000,
});

let refreshInFlight = null;

export const isSessionInvalidError = (error) => {
  const status = Number(error?.response?.status || 0);
  const code = String(error?.response?.data?.error?.code || '').trim();

  if (status === 401 || status === 403) {
    return true;
  }

  return SESSION_INVALID_CODES.has(code);
};

const toAuthFailure = (error, message = 'Session refresh failed') => {
  const wrapped = error instanceof Error ? error : new Error(message);
  wrapped.isAuthFailure = true;
  return wrapped;
};

export const refreshSession = async () => {
  const { refreshToken, setAuth, clearAuth, user, accessToken } = useAuthStore.getState();

  if (!refreshToken) {
    throw toAuthFailure(new Error('No refresh token'));
  }

  let response;
  try {
    response = await axios.post(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { withCredentials: true, timeout: 60000 },
    );
  } catch (error) {
    if (isSessionInvalidError(error)) {
      clearAuth();
      throw toAuthFailure(error);
    }
    throw error;
  }

  const data = response.data?.data;
  if (!data?.accessToken || !data?.refreshToken) {
    clearAuth();
    throw toAuthFailure(new Error('Invalid refresh response'));
  }

  setAuth({
    user: data.user || user,
    accessToken: data.accessToken || accessToken,
    refreshToken: data.refreshToken,
  });

  return data.accessToken;
};

export const restoreSession = async () => {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
};

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) throw error;

    const shouldRefresh = error.response?.status === 401 && !originalRequest._retry;

    if (!shouldRefresh) {
      throw error;
    }

    originalRequest._retry = true;

    const nextAccessToken = await restoreSession();
    originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;

    return api(originalRequest);
  },
);
