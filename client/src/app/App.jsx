import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import PwaInstallPrompt from '../components/PwaInstallPrompt.jsx';

const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../pages/RegisterPage.jsx'));
const LandingPage = lazy(() => import('../pages/LandingPage.jsx'));
const OtpPage = lazy(() => import('../pages/OtpPage.jsx'));
const ChatPage = lazy(() => import('../pages/ChatPage.jsx'));

export default function App() {
  return (
    <>
      <Suspense fallback={<div className="empty-panel">Loading...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/otp" element={<OtpPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <PwaInstallPrompt />
    </>
  );
}
