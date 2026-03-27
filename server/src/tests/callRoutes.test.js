import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { seedQaState } from '../testing/fixtures.js';
import { useMongoTestDb } from './helpers/testDb.js';

const app = createApp();

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const loginAs = async (identifier, password = 'Password123') => {
  const response = await request(app).post('/api/auth/login').send({ identifier, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

describe('call routes', () => {
  useMongoTestDb();

  it('returns call history and ICE server configuration', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);

    const historyResponse = await request(app).get('/api/calls/history').set(authHeader(aliceToken));
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.data).toHaveLength(1);
    expect(historyResponse.body.data[0].status).toBe('completed');

    const iceResponse = await request(app).get('/api/calls/ice-servers').set(authHeader(aliceToken));
    expect(iceResponse.status).toBe(200);
    expect(Array.isArray(iceResponse.body.data)).toBe(true);
  });

  it('enforces conversation membership for active group calls', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);
    const daveToken = await loginAs(fixtures.users.dave.username);

    const allowedResponse = await request(app)
      .get(`/api/calls/group/active/${fixtures.conversations.weekendGroup}`)
      .set(authHeader(aliceToken));

    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.body.data.status).toBe('active');

    const forbiddenResponse = await request(app)
      .get(`/api/calls/group/active/${fixtures.conversations.weekendGroup}`)
      .set(authHeader(daveToken));

    expect(forbiddenResponse.status).toBe(403);
  });
});
