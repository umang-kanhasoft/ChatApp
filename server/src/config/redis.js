import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redisClient = null;

const buildRetryDelay = (attempt) => Math.min(250 * 2 ** Math.max(0, attempt - 1), 5000);

const baseRedisOptions = {
  lazyConnect: true,
  enableReadyCheck: true,
  retryStrategy: (attempt) => buildRetryDelay(attempt),
  reconnectOnError: () => true,
  maxRetriesPerRequest: 1,
};

const bindRedisLogging = (client, label) => {
  client.on('error', (error) => {
    logger.warn('redis client error', {
      label,
      status: client.status,
      error,
    });
  });

  client.on('reconnecting', () => {
    logger.warn('redis client reconnecting', {
      label,
      status: client.status,
    });
  });
};

export const createRedisConnection = ({
  label = 'redis',
  maxRetriesPerRequest = baseRedisOptions.maxRetriesPerRequest,
} = {}) => {
  const client = new Redis(env.REDIS_URL, {
    ...baseRedisOptions,
    maxRetriesPerRequest,
  });

  bindRedisLogging(client, label);
  return client;
};

export const connectRedis = async () => {
  try {
    redisClient = createRedisConnection({
      label: 'primary',
      maxRetriesPerRequest: 1,
    });
    await redisClient.connect();
    logger.info('redis connected', { redisUrl: env.REDIS_URL });
    return redisClient;
  } catch (error) {
    logger.warn('Redis unavailable, running without distributed cache/presence', {
      redisUrl: env.REDIS_URL,
      error,
    });

    if (redisClient) {
      redisClient.disconnect();
    }
    redisClient = null;

    if (env.REDIS_REQUIRED) {
      throw error;
    }

    return null;
  }
};

export const createRedisDuplicate = ({
  label = 'duplicate',
  maxRetriesPerRequest = baseRedisOptions.maxRetriesPerRequest,
} = {}) => {
  if (!redisClient) {
    return null;
  }

  const duplicate = redisClient.duplicate({
    maxRetriesPerRequest,
  });
  bindRedisLogging(duplicate, label);
  return duplicate;
};

export const getRedis = () => redisClient;

export const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

export const getRedisHealth = () => ({
  connected: Boolean(redisClient) && redisClient.status === 'ready',
  status: redisClient?.status || 'disconnected',
  required: env.REDIS_REQUIRED,
});
