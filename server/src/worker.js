import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from './config/db.js';
import { env } from './config/env.js';
import { connectRedis, disconnectRedis, getRedis } from './config/redis.js';
import { startScheduledMessageScheduler } from './jobs/scheduledMessageScheduler.js';
import { initializeQueueRuntime, shutdownQueueRuntime } from './queues/runtime.js';
import { logger } from './utils/logger.js';
import { markShuttingDown } from './utils/lifecycle.js';

let isShuttingDown = false;

const bootstrap = async () => {
  await connectMongo();
  await connectRedis();
  await initializeQueueRuntime();

  const stopScheduledMessageScheduler = startScheduledMessageScheduler({
    redisClient: getRedis(),
  });

  logger.info('worker runtime started', {
    env: env.NODE_ENV,
    role: 'worker',
  });

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    markShuttingDown();
    logger.info('received worker shutdown signal, closing gracefully', { signal });

    stopScheduledMessageScheduler();
    await shutdownQueueRuntime();
    await disconnectRedis();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('worker unhandled rejection', { reason });
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    logger.error('worker uncaught exception', { error });
    process.exit(1);
  });
};

if (mongoose.connection.readyState === 0) {
  bootstrap().catch((error) => {
    logger.error('failed to bootstrap worker runtime', { error });
    process.exit(1);
  });
}
