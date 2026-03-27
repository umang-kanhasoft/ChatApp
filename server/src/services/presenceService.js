import { env } from '../config/env.js';
import { instanceId } from '../utils/instance.js';

const localConnectionCounts = new Map();

const ttlMs = env.SOCKET_PRESENCE_TTL_SECONDS * 1000;
const zsetKey = (userId) => `presence:user:${String(userId)}`;
const socketMember = (socketId) => `${instanceId}:${String(socketId)}`;
const staleBefore = () => Date.now() - ttlMs;

const trackLocalConnect = (userId) => {
  const key = String(userId);
  const nextCount = (localConnectionCounts.get(key) || 0) + 1;
  localConnectionCounts.set(key, nextCount);
  return {
    activeConnections: nextCount,
    becameOnline: nextCount === 1,
  };
};

const trackLocalDisconnect = (userId) => {
  const key = String(userId);
  const nextCount = Math.max(0, (localConnectionCounts.get(key) || 0) - 1);

  if (nextCount === 0) {
    localConnectionCounts.delete(key);
  } else {
    localConnectionCounts.set(key, nextCount);
  }

  return {
    activeConnections: nextCount,
    becameOffline: nextCount === 0,
  };
};

const touchLocalHeartbeat = (userId) => ({
  activeConnections: localConnectionCounts.get(String(userId)) || 0,
});

export const trackPresenceConnected = async ({ redis, userId, socketId }) => {
  if (!redis) {
    return trackLocalConnect(userId);
  }

  const now = Date.now();
  const key = zsetKey(userId);
  const member = socketMember(socketId);

  const [, , , countResult] = await redis
    .multi()
    .zremrangebyscore(key, 0, staleBefore())
    .zadd(key, now, member)
    .pexpire(key, ttlMs * 2)
    .zcard(key)
    .exec();

  const activeConnections = Number(countResult?.[1] || 0);
  return {
    activeConnections,
    becameOnline: activeConnections === 1,
  };
};

export const heartbeatPresenceSocket = async ({ redis, userId, socketId }) => {
  if (!redis) {
    return touchLocalHeartbeat(userId);
  }

  const now = Date.now();
  const key = zsetKey(userId);
  const member = socketMember(socketId);

  await redis
    .multi()
    .zremrangebyscore(key, 0, staleBefore())
    .zadd(key, now, member)
    .pexpire(key, ttlMs * 2)
    .exec();

  return {
    activeConnections: await redis.zcount(key, staleBefore(), '+inf'),
  };
};

export const trackPresenceDisconnected = async ({ redis, userId, socketId }) => {
  if (!redis) {
    return trackLocalDisconnect(userId);
  }

  const key = zsetKey(userId);
  const member = socketMember(socketId);

  const [, , countResult] = await redis
    .multi()
    .zrem(key, member)
    .zremrangebyscore(key, 0, staleBefore())
    .zcard(key)
    .exec();

  const activeConnections = Number(countResult?.[1] || 0);
  if (activeConnections === 0) {
    await redis.del(key);
  } else {
    await redis.pexpire(key, ttlMs * 2);
  }

  return {
    activeConnections,
    becameOffline: activeConnections === 0,
  };
};

export const getPresenceByUserIds = async ({ redis, userIds }) => {
  const uniqueUserIds = [...new Set((userIds || []).map((entry) => String(entry)).filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return {};
  }

  if (!redis) {
    return Object.fromEntries(
      uniqueUserIds.map((userId) => [userId, { isOnline: (localConnectionCounts.get(userId) || 0) > 0 }]),
    );
  }

  const pipeline = redis.multi();
  for (const userId of uniqueUserIds) {
    const key = zsetKey(userId);
    pipeline.zremrangebyscore(key, 0, staleBefore());
    pipeline.zcount(key, staleBefore(), '+inf');
  }

  const results = await pipeline.exec();
  const presence = {};

  for (let index = 0; index < uniqueUserIds.length; index += 1) {
    const countResult = results[index * 2 + 1];
    const activeConnections = Number(countResult?.[1] || 0);
    presence[uniqueUserIds[index]] = {
      isOnline: activeConnections > 0,
      activeConnections,
    };
  }

  return presence;
};
