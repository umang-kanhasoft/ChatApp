import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 60000,
});

let refreshInFlight = null;

const performRefresh = async () => {
  const { refreshToken, setAuth, clearAuth, user, accessToken } = useAuthStore.getState();

  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  let response;
  try {
    response = await axios.post(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { withCredentials: true, timeout: 60000 },
    );
  } catch (error) {
    clearAuth();
    throw error;
  }

  const data = response.data?.data;
  if (!data?.accessToken || !data?.refreshToken) {
    clearAuth();
    throw new Error('Invalid refresh response');
  }

  setAuth({
    user: data.user || user,
    accessToken: data.accessToken || accessToken,
    refreshToken: data.refreshToken,
  });

  return data.accessToken;
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

    if (!refreshInFlight) {
      refreshInFlight = performRefresh().finally(() => {
        refreshInFlight = null;
      });
    }

    const nextAccessToken = await refreshInFlight;
    originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;

    return api(originalRequest);
  },
);
