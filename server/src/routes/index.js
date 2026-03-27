import { Router } from 'express';
import mongoose from 'mongoose';
import createAuthRoutes from './authRoutes.js';
import callRoutes from './callRoutes.js';
import conversationRoutes from './conversationRoutes.js';
import { getMongoHealth } from '../config/db.js';
import { getRedisHealth } from '../config/redis.js';
import moderationRoutes from './moderationRoutes.js';
import { getQueueHealth } from '../queues/runtime.js';
import statusRoutes from './statusRoutes.js';
import { instanceId } from '../utils/instance.js';
import userRoutes from './userRoutes.js';

export const createApiRoutes = ({ redisClient = null } = {}) => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        instanceId,
        timestamp: new Date().toISOString(),
        dependencies: {
          mongo: getMongoHealth(),
          redis: getRedisHealth(),
          queues: getQueueHealth(),
        },
      },
    });
  });

  router.get('/health/live', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'live',
        instanceId,
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.get('/health/ready', (_req, res) => {
    const mongo = getMongoHealth();
    const redis = getRedisHealth();
    const queues = getQueueHealth();
    const ready =
      mongoose.connection.readyState === 1 && (!redis.required || redis.connected) && (!redis.required || queues.enabled);

    res.status(ready ? 200 : 503).json({
      success: ready,
      data: {
        status: ready ? 'ready' : 'not_ready',
        instanceId,
        timestamp: new Date().toISOString(),
        dependencies: {
          mongo,
          redis,
          queues,
        },
      },
    });
  });

  router.use('/auth', createAuthRoutes({ redisClient }));
  router.use('/conversations', conversationRoutes);
  router.use('/calls', callRoutes);
  router.use('/status', statusRoutes);
  router.use('/users', userRoutes);
  router.use('/moderation', moderationRoutes);

  return router;
};

export default createApiRoutes;
