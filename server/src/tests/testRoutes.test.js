import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { seedQaState } from '../testing/fixtures.js';
import { useMongoTestDb } from './helpers/testDb.js';

const app = createApp();

describe('test-only QA routes', () => {
  useMongoTestDb();

  it('returns the route and socket manifest', async () => {
    const response = await request(app).get('/api/test/manifest');

    expect(response.status).toBe(200);
    expect(response.body.data.routes).toContain('/api/auth/register');
    expect(response.body.data.socketEvents).toContain('message:new');
  });

  it('bootstraps deterministic fixtures', async () => {
    const response = await request(app).post('/api/test/bootstrap').send({});

    expect(response.status).toBe(201);
    expect(response.body.data.credentials.otpCode).toBeTruthy();
    expect(response.body.data.users.alice.username).toBe('alice');
    expect(response.body.data.conversations.privateAliceBob).toBeTruthy();
    expect(response.body.data.statuses.alicePublic).toBeTruthy();
    expect(response.body.data.calls.activeGroupCall).toBeTruthy();
  });

  it('resets all seeded state', async () => {
    await seedQaState();

    const resetResponse = await request(app).post('/api/test/reset').send({});
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.data.reset).toBe(true);

    const manifestResponse = await request(app).get('/api/test/manifest');
    expect(manifestResponse.status).toBe(200);
  });
});
