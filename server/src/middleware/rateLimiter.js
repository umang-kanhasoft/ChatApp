import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

const windowMs = 15 * 60 * 1000;
const authWindowMs = 10 * 60 * 1000;
const otpWindowMs = 10 * 60 * 1000;
const resettableStores = new Set();

const buildStore = (redis) => {
  const store = redis
    ? new RedisStore({
        sendCommand: (...args) => redis.call(...args),
      })
    : new MemoryStore();

  if (typeof store?.resetAll === 'function') {
    resettableStores.add(store);
  }

  return store;
};

const createLimiter = ({ redis, keyPrefix, limitWindowMs, max, message, code }) =>
  rateLimit({
    windowMs: limitWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore(redis),
    keyGenerator: (req) => `${keyPrefix}:${req.ip}:${req.originalUrl}`,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code,
          message,
          requestId: req.requestId,
        },
      });
    },
  });

export const createApiLimiter = (redis = null) => {
  return createLimiter({
    redis,
    keyPrefix: 'api',
    limitWindowMs: windowMs,
    max: 300,
    message: 'Too many requests',
    code: 'RATE_LIMITED',
  });
};

export const createAuthLimiter = (redis = null) =>
  createLimiter({
    redis,
    keyPrefix: 'auth',
    limitWindowMs: authWindowMs,
    max: 20,
    message: 'Too many authentication attempts',
    code: 'AUTH_RATE_LIMITED',
  });

export const createOtpLimiter = (redis = null) =>
  createLimiter({
    redis,
    keyPrefix: 'otp',
    limitWindowMs: otpWindowMs,
    max: 6,
    message: 'Too many OTP requests',
    code: 'OTP_RATE_LIMITED',
  });

export const resetRateLimiters = async () => {
  await Promise.all(
    [...resettableStores].map(async (store) => {
      try {
        await store.resetAll();
      } catch {
        // Ignore reset failures in non-memory stores.
      }
    }),
  );
};
