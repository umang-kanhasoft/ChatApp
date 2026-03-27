import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { connectMongo, disconnectMongo } from '../../config/db.js';

export const useMongoTestDb = () => {
  beforeAll(async () => {
    await connectMongo();
  });

  afterEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
    }
  });

  afterAll(async () => {
    await disconnectMongo();
  });
};
