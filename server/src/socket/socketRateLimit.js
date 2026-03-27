import { getRedis } from '../config/redis.js';

const limits = {
  'conversation:join-all': { max: 4, windowMs: 60_000 },
  'message:send': { max: 40, windowMs: 10_000 },
  'message:delivered': { max: 200, windowMs: 10_000 },
  'message:read': { max: 50, windowMs: 10_000 },
  'typing:start': { max: 24, windowMs: 5_000 },
  'typing:stop': { max: 24, windowMs: 5_000 },
  'call:signal': { max: 300, windowMs: 10_000 },
  'group-call:signal': { max: 500, windowMs: 10_000 },
};

const localWindows = new Map();

const getKey = ({ userId, socketId, eventName }) =>
  `ratelimit:socket:${eventName}:${String(userId)}:${String(socketId)}`;

const consumeLocalLimit = ({ key, max, windowMs }) => {
  const now = Date.now();
  const current = localWindows.get(key);

  if (!current || current.expiresAt <= now) {
    localWindows.set(key, {
      count: 1,
      expiresAt: now + windowMs,
    });

    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }

  current.count += 1;
  localWindows.set(key, current);

  return {
    allowed: current.count <= max,
    retryAfterMs: Math.max(0, current.expiresAt - now),
  };
};

export const consumeSocketEventRateLimit = async ({ userId, socketId, eventName }) => {
  const limit = limits[eventName];
  if (!limit) {
    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }

  const key = getKey({ userId, socketId, eventName });
  const redis = getRedis();
  if (!redis) {
    return consumeLocalLimit({
      key,
      max: limit.max,
      windowMs: limit.windowMs,
    });
  }

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, limit.windowMs);
  }

  return {
    allowed: count <= limit.max,
    retryAfterMs: count <= limit.max ? 0 : await redis.pttl(key),
  };
};

export const resetSocketEventRateLimits = () => {
  localWindows.clear();
};
