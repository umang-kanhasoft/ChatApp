import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { restoreSession } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

export default function ProtectedRoute({ children }) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const location = useLocation();
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);

  useEffect(() => {
    if (!hasHydrated) return undefined;
    if (accessToken || !refreshToken) {
      setIsRestoring(false);
      setRestoreError(null);
      return undefined;
    }

    let isCancelled = false;
    setIsRestoring(true);
    setRestoreError(null);

    restoreSession()
      .catch((error) => {
        if (!isCancelled) {
          setRestoreError(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsRestoring(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [accessToken, hasHydrated, refreshToken]);

  if (!hasHydrated || isRestoring) {
    return <div className="empty-panel">Restoring session...</div>;
  }

  if (!accessToken && refreshToken) {
    if (restoreError && !restoreError.isAuthFailure) {
      return <div className="empty-panel">Trying to reconnect...</div>;
    }

    return <div className="empty-panel">Restoring session...</div>;
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
