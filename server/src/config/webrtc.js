import { env } from './env.js';

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const normalizeIceServer = (entry) => {
  if (!entry || typeof entry !== 'object') return null;

  const { urls, username, credential } = entry;
  const normalizedUrls = Array.isArray(urls)
    ? urls.filter((item) => typeof item === 'string' && item.trim())
    : typeof urls === 'string' && urls.trim()
      ? urls
      : null;

  if (!normalizedUrls) return null;

  const normalized = { urls: normalizedUrls };
  if (typeof username === 'string' && username.trim()) {
    normalized.username = username;
  }
  if (typeof credential === 'string' && credential.trim()) {
    normalized.credential = credential;
  }

  return normalized;
};

const parseIceServersFromEnv = () => {
  if (!env.WEBRTC_ICE_SERVERS) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const raw = JSON.parse(env.WEBRTC_ICE_SERVERS);
    if (!Array.isArray(raw)) return DEFAULT_ICE_SERVERS;

    const normalized = raw.map(normalizeIceServer).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
};

const parsedIceServers = parseIceServersFromEnv();

export const getIceServers = () => parsedIceServers;
