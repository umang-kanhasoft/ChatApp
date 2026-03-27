import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { restoreSession } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

vi.mock('../services/api.js', () => ({
  restoreSession: vi.fn(),
}));

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/chat"
          element={(
            <ProtectedRoute>
              <div>Secure chat</div>
            </ProtectedRoute>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('redirects to login when no session is available', async () => {
    renderRoute();

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('restores the session from the refresh token before rendering protected content', async () => {
    useAuthStore.setState({
      user: { id: 'user-1', username: 'alice' },
      accessToken: null,
      refreshToken: 'refresh-token-1',
      hasHydrated: true,
    });

    restoreSession.mockImplementation(async () => {
      useAuthStore.getState().setAuth({
        user: { id: 'user-1', username: 'alice' },
        accessToken: 'access-token-1',
        refreshToken: 'refresh-token-2',
      });
      return 'access-token-1';
    });

    renderRoute();

    await waitFor(() => expect(restoreSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Secure chat')).toBeInTheDocument();
  });
});
