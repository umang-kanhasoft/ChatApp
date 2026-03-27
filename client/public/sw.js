const CACHE_NAME = 'chatapp-shell-v1';
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192.png',
  '/pwa-512.png',
  '/maskable-192.png',
  '/maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon.ico',
  '/whatsapp_Back.png',
  '/groups.svg',
  '/person.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

const shouldHandleFetch = (requestUrl, request) => {
  if (request.method !== 'GET') return false;
  if (requestUrl.origin !== self.location.origin) return false;
  if (requestUrl.pathname.startsWith('/api/')) return false;
  return true;
};

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (!shouldHandleFetch(requestUrl, event.request)) {
    return;
  }

  // SPA navigation: network first, fallback to cached app shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/index.html')) || Response.error();
        }),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => Response.error());

      return cachedResponse || fetchPromise;
    }),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || 'New message';
  const body = payload.body || 'You received a new message';
  const url = payload.url || '/chat';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url, conversationId: payload.conversationId },
      badge: '/favicon-32.png',
      icon: '/pwa-192.png',
      tag: payload.conversationId || 'chat-message',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return null;
    }),
  );
});
