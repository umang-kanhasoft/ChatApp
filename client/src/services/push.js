const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID_PUBLIC_KEY);

export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
};

export const requestPushSubscription = async () => {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this environment');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error('Failed to register service worker');
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing.toJSON();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  return subscription.toJSON();
};

export const getExistingPushSubscription = async () => {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;

  const subscription = await registration.pushManager.getSubscription();
  return subscription ? subscription.toJSON() : null;
};

export const unsubscribeFromPush = async () => {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
};
