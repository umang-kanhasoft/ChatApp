import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { createRedisConnection, getRedis } from '../config/redis.js';
import { getCallLogById, markCallMissedIfRinging } from '../services/callService.js';
import { sendPushToUsers } from '../services/pushService.js';
import { instanceId } from '../utils/instance.js';
import { setQueueDepth, trackQueueProcessed } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

const PUSH_QUEUE_NAME = 'push_notifications';
const CALL_RING_QUEUE_NAME = 'call_ring_timeout';

const localRingTimeoutHandles = new Map();

const runtime = {
  io: null,
  pushQueue: null,
  callRingQueue: null,
  workers: [],
  interval: null,
  connections: [],
};

const toStringId = (value) => String(value);

const refreshQueueDepth = async (name, queue) => {
  if (!queue) {
    return;
  }

  try {
    const counts = await queue.getJobCounts('waiting', 'delayed', 'active');
    setQueueDepth(name, (counts.waiting || 0) + (counts.delayed || 0) + (counts.active || 0));
  } catch (error) {
    logger.warn('failed to refresh queue depth', {
      queue: name,
      error,
    });
  }
};

const createQueue = (name) => {
  const connection = createRedisConnection({
    label: `${name}-producer`,
    maxRetriesPerRequest: null,
  });

  runtime.connections.push(connection);

  return new Queue(name, {
    connection,
    prefix: 'chatapp',
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });
};

const createWorker = (name, processor, { concurrency = 1 } = {}) => {
  const connection = createRedisConnection({
    label: `${name}-worker`,
    maxRetriesPerRequest: null,
  });

  runtime.connections.push(connection);

  const worker = new Worker(name, processor, {
    concurrency,
    connection,
    prefix: 'chatapp',
  });

  worker.on('completed', () => {
    trackQueueProcessed(name, 'completed');
    const queue = name === PUSH_QUEUE_NAME ? runtime.pushQueue : runtime.callRingQueue;
    void refreshQueueDepth(name, queue);
  });

  worker.on('failed', (_job, error) => {
    trackQueueProcessed(name, 'failed');
    logger.warn('queue job failed', {
      queue: name,
      error,
    });
    const queue = name === PUSH_QUEUE_NAME ? runtime.pushQueue : runtime.callRingQueue;
    void refreshQueueDepth(name, queue);
  });

  runtime.workers.push(worker);
  return worker;
};

const startDepthRefreshLoop = () => {
  if (runtime.interval) {
    clearInterval(runtime.interval);
  }

  runtime.interval = setInterval(() => {
    void refreshQueueDepth(PUSH_QUEUE_NAME, runtime.pushQueue);
    void refreshQueueDepth(CALL_RING_QUEUE_NAME, runtime.callRingQueue);
  }, 5000);

  runtime.interval.unref?.();
};

const processPushNotification = async (job) => {
  await sendPushToUsers(job.data);
};

const processCallRingTimeout = async (job) => {
  const { callId, callerId, calleeId, conversationId } = job.data;
  const call = await markCallMissedIfRinging({ callId });
  if (call.status !== 'missed') {
    return;
  }

  runtime.io?.to(`user:${toStringId(callerId)}`).emit('call:missed', {
    callId,
    conversationId,
  });
  runtime.io?.to(`user:${toStringId(calleeId)}`).emit('call:missed', {
    callId,
    conversationId,
  });
};

export const initializeQueueRuntime = async ({ io } = {}) => {
  runtime.io = io || null;

  if (!getRedis()) {
    logger.warn('queue runtime running in degraded mode without Redis');
    return false;
  }

  runtime.pushQueue = createQueue(PUSH_QUEUE_NAME);
  runtime.callRingQueue = createQueue(CALL_RING_QUEUE_NAME);

  createWorker(PUSH_QUEUE_NAME, processPushNotification, {
    concurrency: env.PUSH_QUEUE_CONCURRENCY,
  });
  createWorker(CALL_RING_QUEUE_NAME, processCallRingTimeout, {
    concurrency: 10,
  });

  startDepthRefreshLoop();
  await Promise.all([
    refreshQueueDepth(PUSH_QUEUE_NAME, runtime.pushQueue),
    refreshQueueDepth(CALL_RING_QUEUE_NAME, runtime.callRingQueue),
  ]);

  logger.info('queue runtime initialized', {
    instanceId,
    redisEnabled: true,
  });

  return true;
};

export const queuePushNotification = async (payload) => {
  if (!payload?.userIds?.length) {
    return;
  }

  if (!runtime.pushQueue) {
    setImmediate(() => {
      void sendPushToUsers(payload).catch((error) => {
        logger.warn('inline push delivery failed', { error });
      });
    });
    return;
  }

  await runtime.pushQueue.add('dispatch', payload, {
    attempts: env.PUSH_QUEUE_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: env.PUSH_QUEUE_BACKOFF_MS,
    },
  });

  await refreshQueueDepth(PUSH_QUEUE_NAME, runtime.pushQueue);
};

const localTimeoutKey = (callId) => `call:ring:${toStringId(callId)}`;

export const cancelCallRingTimeout = async (callId) => {
  const key = localTimeoutKey(callId);
  const localTimeout = localRingTimeoutHandles.get(key);
  if (localTimeout) {
    clearTimeout(localTimeout);
    localRingTimeoutHandles.delete(key);
  }

  if (!runtime.callRingQueue) {
    return;
  }

  const job = await runtime.callRingQueue.getJob(key);
  if (job) {
    await job.remove();
    await refreshQueueDepth(CALL_RING_QUEUE_NAME, runtime.callRingQueue);
  }
};

export const scheduleCallRingTimeout = async ({
  callId,
  callerId,
  calleeId,
  conversationId,
  delayMs,
}) => {
  const call = await getCallLogById({ callId });
  if (call.status !== 'ringing') {
    return;
  }

  const key = localTimeoutKey(callId);
  await cancelCallRingTimeout(callId);

  if (!runtime.callRingQueue) {
    const timeout = setTimeout(() => {
      void processCallRingTimeout({
        data: { callId, callerId, calleeId, conversationId },
      }).catch((error) => {
        logger.warn('local call ring timeout failed', { error });
      });
    }, delayMs);

    timeout.unref?.();
    localRingTimeoutHandles.set(key, timeout);
    return;
  }

  await runtime.callRingQueue.add(
    'ring-timeout',
    {
      callId,
      callerId,
      calleeId,
      conversationId,
    },
    {
      jobId: key,
      delay: delayMs,
      attempts: 1,
    },
  );

  await refreshQueueDepth(CALL_RING_QUEUE_NAME, runtime.callRingQueue);
};

export const getQueueHealth = () => ({
  enabled: Boolean(runtime.pushQueue) && Boolean(runtime.callRingQueue),
  redisBacked: Boolean(getRedis()),
});

export const shutdownQueueRuntime = async () => {
  if (runtime.interval) {
    clearInterval(runtime.interval);
    runtime.interval = null;
  }

  for (const timeout of localRingTimeoutHandles.values()) {
    clearTimeout(timeout);
  }
  localRingTimeoutHandles.clear();

  await Promise.all(runtime.workers.map((worker) => worker.close()));
  runtime.workers = [];

  await Promise.all(
    [runtime.pushQueue, runtime.callRingQueue].filter(Boolean).map((queue) => queue.close()),
  );
  runtime.pushQueue = null;
  runtime.callRingQueue = null;

  await Promise.all(runtime.connections.map((connection) => connection.quit().catch(() => undefined)));
  runtime.connections = [];
};
