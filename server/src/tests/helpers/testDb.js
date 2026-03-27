import { afterAll, afterEach, beforeAll } from 'vitest';
import { connectMongo, disconnectMongo } from '../../config/db.js';
import { resetQaState } from '../../testing/fixtures.js';

export const useMongoTestDb = () => {
  beforeAll(async () => {
    await connectMongo();
  });

  afterEach(async () => {
    await resetQaState();
  });

  afterAll(async () => {
    await disconnectMongo();
  });
};
