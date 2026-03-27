import { env } from './env.js';

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const allowlistedOrigins = new Set([
  env.CLIENT_URL,
  ...splitList(env.CLIENT_URLS),
]);

const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;
const lanPattern =
  /^https?:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(:\d{1,5})?$/i;

export const isOriginAllowed = (origin) => {
  // Non-browser requests (curl, server-to-server, same-origin) may omit Origin.
  if (!origin) return true;
  if (allowlistedOrigins.has(origin)) return true;

  // In development, allow local dev hosts and LAN testing URLs.
  if (env.NODE_ENV !== 'production') {
    if (localhostPattern.test(origin)) return true;
    if (lanPattern.test(origin)) return true;
  }

  return false;
};

const handleCorsOrigin = (origin, callback) => {
  callback(null, isOriginAllowed(origin));
};

export const corsOptions = {
  origin: handleCorsOrigin,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

export const socketCorsOptions = {
  origin: handleCorsOrigin,
  credentials: true,
};

