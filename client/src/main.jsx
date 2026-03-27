import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App.jsx';
import { registerServiceWorker } from './services/push.js';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    window.navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().catch(() => {});
      });
    }).catch(() => {});

    window.caches?.keys?.().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        window.caches.delete(cacheName).catch(() => {});
      });
    }).catch(() => {});
  } else {
    registerServiceWorker().catch(() => {
      // Service worker registration is best-effort in production.
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
