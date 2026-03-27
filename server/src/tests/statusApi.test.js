import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { Status } from '../models/Status.js';
import { seedQaState } from '../testing/fixtures.js';
import { useMongoTestDb } from './helpers/testDb.js';

const app = createApp();

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const loginAs = async (identifier, password = 'Password123') => {
  const response = await request(app).post('/api/auth/login').send({ identifier, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

describe('status API coverage', () => {
  useMongoTestDb();

  it('applies privacy rules in the status feed', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);
    const daveToken = await loginAs(fixtures.users.dave.username);

    const aliceFeedResponse = await request(app).get('/api/status').set(authHeader(aliceToken));
    const daveFeedResponse = await request(app).get('/api/status').set(authHeader(daveToken));

    expect(aliceFeedResponse.status).toBe(200);
    expect(aliceFeedResponse.body.data.map((status) => status.text)).toEqual(
      expect.arrayContaining(['Alice status update', 'Bob contacts only']),
    );
    expect(aliceFeedResponse.body.data.map((status) => status.text)).not.toContain('Carol private story');

    expect(daveFeedResponse.status).toBe(200);
    expect(daveFeedResponse.body.data.map((status) => status.text)).toEqual(
      expect.arrayContaining(['Alice status update']),
    );
    expect(daveFeedResponse.body.data.map((status) => status.text)).not.toContain('Bob contacts only');
  });

  it('creates, views, reacts to, and deletes statuses', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);
    const bobToken = await loginAs(fixtures.users.bob.username);

    const createResponse = await request(app)
      .post('/api/status')
      .set(authHeader(aliceToken))
      .send({
        type: 'text',
        text: 'Status <script>alert(1)</script> hello',
        privacy: 'contacts',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.text).toBe('Status  hello');

    const statusId = createResponse.body.data._id;

    const viewResponse = await request(app)
      .post(`/api/status/${statusId}/view`)
      .set(authHeader(bobToken))
      .send({});

    expect(viewResponse.status).toBe(200);
    expect(viewResponse.body.data.viewedBy).toHaveLength(1);

    const reactResponse = await request(app)
      .post(`/api/status/${statusId}/react`)
      .set(authHeader(bobToken))
      .send({ emoji: '👏' });

    expect(reactResponse.status).toBe(200);
    expect(reactResponse.body.data.reactions).toHaveLength(1);

    const deleteResponse = await request(app)
      .delete(`/api/status/${statusId}`)
      .set(authHeader(aliceToken));

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.deleted).toBe(true);
  });

  it('rejects unsupported media uploads and expires statuses via TTL metadata', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);

    const badUploadResponse = await request(app)
      .post('/api/status/media')
      .set(authHeader(aliceToken))
      .attach('file', Buffer.from('plain text'), {
        filename: 'status.txt',
        contentType: 'text/plain',
      });

    expect(badUploadResponse.status).toBe(400);

    const status = await Status.findById(fixtures.statuses.alicePublic).lean();
    expect(status.expiresAt).toBeTruthy();
    expect(new Date(status.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
