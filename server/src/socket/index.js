import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { createRedisDuplicate, getRedis } from '../config/redis.js';
import { socketCorsOptions } from '../config/cors.js';
import { User } from '../models/User.js';
import { leaveUserFromAllActiveGroupCalls } from '../services/groupCallService.js';
import {
  heartbeatPresenceSocket,
  trackPresenceConnected,
  trackPresenceDisconnected,
} from '../services/presenceService.js';
import { instanceId } from '../utils/instance.js';
import { trackSocketConnected, trackSocketDisconnected, trackSocketEvent } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';
import { socketAuth } from './middleware/socketAuth.js';
import { registerChatHandlers } from './handlers/registerChatHandlers.js';

const toStringId = (value) => String(value);

const markUserOnline = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $set: {
      isOnline: true,
      lastSeen: new Date(),
    },
  });
};

const markUserOffline = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $set: {
      isOnline: false,
      lastSeen: new Date(),
    },
  });
};

const attachRedisAdapter = async (io) => {
  if (!getRedis()) {
    return async () => {};
  }

  const pubClient = createRedisDuplicate({
    label: 'socket-adapter-pub',
    maxRetriesPerRequest: null,
  });
  const subClient = createRedisDuplicate({
    label: 'socket-adapter-sub',
    maxRetriesPerRequest: null,
  });

  if (!pubClient || !subClient) {
    return async () => {};
  }

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  logger.info('socket.io redis adapter enabled', {
    instanceId,
  });

  return async () => {
    await Promise.all([pubClient.quit(), subClient.quit()]);
  };
};

export const createSocketServer = async (httpServer) => {
  const io = new Server(httpServer, {
    cors: socketCorsOptions,
    transports: ['websocket', 'polling'],
    perMessageDeflate: {
      threshold: 1024,
    },
    httpCompression: {
      threshold: 1024,
    },
    maxHttpBufferSize: env.SOCKET_MAX_HTTP_BUFFER_SIZE,
    connectionStateRecovery: {
      maxDisconnectionDuration: env.SOCKET_CONNECTION_RECOVERY_MS,
      skipMiddlewares: true,
    },
  });

  const adapterCleanup = await attachRedisAdapter(io);

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    trackSocketConnected();

    socket.onAny((eventName) => {
      trackSocketEvent('in', eventName);
    });

    if (typeof socket.onAnyOutgoing === 'function') {
      socket.onAnyOutgoing((eventName) => {
        trackSocketEvent('out', eventName);
      });
    }

    const userId = socket.user.id;
    const redis = getRedis();

    await socket.join(`user:${userId}`);

    const heartbeat = setInterval(() => {
      void heartbeatPresenceSocket({
        redis,
        userId,
        socketId: socket.id,
      });
    }, env.SOCKET_PRESENCE_HEARTBEAT_INTERVAL_SECONDS * 1000);
    heartbeat.unref?.();

    const connectionState = await trackPresenceConnected({
      redis,
      userId,
      socketId: socket.id,
    });

    if (connectionState.becameOnline) {
      await markUserOnline(userId);
      io.emit('presence:update', {
        userId,
        isOnline: true,
        lastSeen: new Date().toISOString(),
      });
    }

    registerChatHandlers({ io, socket });

    socket.on('disconnect', async () => {
      clearInterval(heartbeat);
      trackSocketDisconnected();

      const disconnectState = await trackPresenceDisconnected({
        redis,
        userId,
        socketId: socket.id,
      });

      if (!disconnectState.becameOffline) {
        return;
      }

      const updatedGroupSessions = await leaveUserFromAllActiveGroupCalls({ userId });
      for (const session of updatedGroupSessions) {
        const conversationId = toStringId(session.conversation?._id || session.conversation);
        const participants = (session.participants || []).map((entry) => {
          const participantUser = entry.user || {};
          return {
            user: {
              _id: toStringId(participantUser._id || participantUser),
              username: participantUser.username || '',
              displayName: participantUser.displayName || '',
              avatar: participantUser.avatar || '',
            },
            joinedAt: entry.joinedAt,
          };
        });

        io.to(`conversation:${conversationId}`).emit('group-call:participant-left', {
          sessionId: toStringId(session._id),
          conversationId,
          userId,
          participants,
        });

        if (session.status === 'ended') {
          io.to(`conversation:${conversationId}`).emit('group-call:ended', {
            sessionId: toStringId(session._id),
            conversationId,
          });
        }
      }

      await markUserOffline(userId);
      io.emit('presence:update', {
        userId,
        isOnline: false,
        lastSeen: new Date().toISOString(),
      });
    });
  });

  io.shutdown = async () => {
    await adapterCleanup();
    io.close();
  };

  return io;
};
