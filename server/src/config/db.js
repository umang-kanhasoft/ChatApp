import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

let memoryMongo = null;

const mongoOptions = {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
};

const canUseMemoryFallback = env.NODE_ENV !== 'production' && env.MONGODB_FALLBACK_TO_MEMORY;

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
