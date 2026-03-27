import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { Message } from '../models/Message.js';
import { seedQaState } from '../testing/fixtures.js';
import { useMongoTestDb } from './helpers/testDb.js';

const app = createApp();

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const loginAs = async (identifier, password = 'Password123') => {
  const response = await request(app).post('/api/auth/login').send({ identifier, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

describe('security and authorization coverage', () => {
  useMongoTestDb();

  it('rejects unauthorized access to protected APIs', async () => {
    const conversationsResponse = await request(app).get('/api/conversations');
    expect(conversationsResponse.status).toBe(401);

    const statusResponse = await request(app).get('/api/status');
    expect(statusResponse.status).toBe(401);
  });

  it('blocks IDOR access to conversations and statuses', async () => {
    const fixtures = await seedQaState();
    const daveToken = await loginAs(fixtures.users.dave.username);

    const conversationResponse = await request(app)
      .get(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages`)
      .set(authHeader(daveToken));

    expect(conversationResponse.status).toBe(403);

    const statusResponse = await request(app)
      .post(`/api/status/${fixtures.statuses.bobContacts}/view`)
      .set(authHeader(daveToken))
      .send({});

    expect(statusResponse.status).toBe(403);
  });

  it('sanitizes stored message content against XSS payloads', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);

    const sendResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages`)
      .set(authHeader(aliceToken))
      .send({
        clientMessageId: 'security-xss-message',
        type: 'text',
        text: '<img src=x onerror=alert(1)><script>alert(2)</script>Hello',
      });

    expect(sendResponse.status).toBe(201);
    expect(sendResponse.body.data.content.text).toBe('Hello');

    const storedMessage = await Message.findById(sendResponse.body.data._id).lean();
    expect(storedMessage.content.text).toBe('Hello');
  });

  it('requires authentication before exposing ICE server configuration', async () => {
    const response = await request(app).get('/api/calls/ice-servers');
    expect(response.status).toBe(401);
  });
});
