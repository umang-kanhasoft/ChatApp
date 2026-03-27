import http from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectMongo, disconnectMongo } from './config/db.js';
import { env } from './config/env.js';
import { connectRedis, disconnectRedis, getRedis } from './config/redis.js';
import { initializeQueueRuntime, shutdownQueueRuntime } from './queues/runtime.js';
import { createSocketServer } from './socket/index.js';
import { startScheduledMessageScheduler } from './jobs/scheduledMessageScheduler.js';
import { logger } from './utils/logger.js';

let isShuttingDown = false;

const bootstrap = async () => {
  await connectMongo();
  await connectRedis();

  const app = createApp({ redisClient: getRedis() });
  const httpServer = http.createServer(app);
  const io = await createSocketServer(httpServer);
  app.set('io', io);
  await initializeQueueRuntime({ io });
  const stopScheduledMessageScheduler = startScheduledMessageScheduler({
    io,
    redisClient: getRedis(),
  });

  httpServer.timeout = 30000; // 30 seconds global timeout
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.listen(env.PORT, () => {
    logger.info('server listening', { port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info('received shutdown signal, closing gracefully', { signal });

    stopScheduledMessageScheduler();
    await shutdownQueueRuntime();
    await io.shutdown?.();

    httpServer.close(async () => {
      await disconnectRedis();
      await disconnectMongo();
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('forcefully terminating process after shutdown timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { reason });
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error });
    process.exit(1);
  });
};

if (mongoose.connection.readyState === 0) {
  bootstrap().catch((error) => {
    logger.error('failed to bootstrap server', { error });
    process.exit(1);
  });
}
