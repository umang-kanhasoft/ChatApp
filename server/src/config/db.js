import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

let memoryMongo = null;

const LOCAL_MONGO_HOST_PATTERN =
  /^mongodb:\/\/(?:(?:[^@/]+)@)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)(?::\d+)?(?:[/?]|$)/i;

const mongoOptions = {
  maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
  minPoolSize: env.MONGODB_MIN_POOL_SIZE,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: env.MONGODB_SOCKET_TIMEOUT_MS,
};

const isLocalMongoUri = (uri) => LOCAL_MONGO_HOST_PATTERN.test(String(uri || '').trim());
const canUseMemoryFallback =
  env.NODE_ENV === 'test' || (env.NODE_ENV !== 'production' && env.MONGODB_FALLBACK_TO_MEMORY && isLocalMongoUri(env.MONGODB_URI));

const connectWithUri = async (uri) => {
  await mongoose.connect(uri, mongoOptions);
};

const connectMemoryMongo = async () => {
  memoryMongo = await MongoMemoryServer.create({
    instance: {
      dbName: 'chatapp',
    },
  });

  await connectWithUri(memoryMongo.getUri());
};

export const connectMongo = async () => {
  try {
    await connectWithUri(env.MONGODB_URI);
  } catch (error) {
    if (!canUseMemoryFallback) {
      if (env.MONGODB_FALLBACK_TO_MEMORY && !isLocalMongoUri(env.MONGODB_URI)) {
        logger.error('refusing in-memory Mongo fallback for non-local database URI', {
          mongoUri: env.MONGODB_URI,
        });
      }
      throw error;
    }

    logger.warn('MongoDB not reachable, starting in-memory fallback for development', {
      mongoUri: env.MONGODB_URI,
      error,
    });
    await connectMemoryMongo();
  }
};

export const disconnectMongo = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  if (memoryMongo) {
    await memoryMongo.stop();
    memoryMongo = null;
  }
};

export const getMongoHealth = () => ({
  connected: mongoose.connection.readyState === 1,
  readyState: mongoose.connection.readyState,
  usingMemoryServer: Boolean(memoryMongo),
});
