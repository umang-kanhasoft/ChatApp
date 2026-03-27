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

describe('conversation and messaging API coverage', () => {
  useMongoTestDb();

  it('lists messages in chronological order and supports search', async () => {
    const fixtures = await seedQaState();
    const accessToken = await loginAs(fixtures.users.alice.username);

    const messagesResponse = await request(app)
      .get(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages`)
      .set(authHeader(accessToken));

    expect(messagesResponse.status).toBe(200);
    expect(messagesResponse.body.data).toHaveLength(2);
    expect(messagesResponse.body.data[0].content.text).toBe('Hello Bob');
    expect(messagesResponse.body.data[1].content.text).toBe('Hi Alice');

    const searchResponse = await request(app)
      .get(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages/search`)
      .query({ q: 'hello', limit: 10 })
      .set(authHeader(accessToken));

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.data).toHaveLength(1);
    expect(searchResponse.body.data[0].content.text).toBe('Hello Bob');
  });

  it('creates, updates, and toggles reactions without duplicating messages', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);

    const sendResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages`)
      .set(authHeader(aliceToken))
      .send({
        clientMessageId: 'conversation-api-new-message',
        type: 'text',
        text: '<b>Hello</b> <script>alert(1)</script>Bob',
      });

    expect(sendResponse.status).toBe(201);
    expect(sendResponse.body.data.content.text).toBe('Hello Bob');

    const messageId = sendResponse.body.data._id;
    const editResponse = await request(app)
      .patch(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages/${messageId}`)
      .set(authHeader(aliceToken))
      .send({ text: 'Updated <i>message</i>' });

    expect(editResponse.status).toBe(200);
    expect(editResponse.body.data.content.text).toBe('Updated message');

    const firstReactionResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages/${messageId}/reactions`)
      .set(authHeader(aliceToken))
      .send({ emoji: '🔥' });

    expect(firstReactionResponse.status).toBe(200);
    expect(firstReactionResponse.body.data.reactions).toHaveLength(1);

    const secondReactionResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages/${messageId}/reactions`)
      .set(authHeader(aliceToken))
      .send({ emoji: '🔥' });

    expect(secondReactionResponse.status).toBe(200);
    expect(secondReactionResponse.body.data.reactions).toHaveLength(0);

    const storedMessages = await Message.find({
      conversation: fixtures.conversations.privateAliceBob,
      clientMessageId: 'conversation-api-new-message',
    });
    expect(storedMessages).toHaveLength(1);
  });

  it('rejects unsupported uploads and accepts supported media attachments', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);

    const badUploadResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages/media`)
      .set(authHeader(aliceToken))
      .attach('file', Buffer.from('malware'), {
        filename: 'payload.exe',
        contentType: 'application/x-msdownload',
      });

    expect(badUploadResponse.status).toBe(400);
    expect(badUploadResponse.body.error.message).toMatch(/unsupported/i);

    const goodUploadResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/messages/media`)
      .set(authHeader(aliceToken))
      .field('text', 'Screenshot attached')
      .attach('file', Buffer.from('pretend image bytes'), {
        filename: 'image.png',
        contentType: 'image/png',
      });

    expect(goodUploadResponse.status).toBe(201);
    expect(goodUploadResponse.body.data.type).toBe('image');
    expect(goodUploadResponse.body.data.content.mediaUrl).toContain('/uploads/');
  });

  it('supports message read idempotency for seeded unread conversations', async () => {
    const fixtures = await seedQaState();
    const aliceToken = await loginAs(fixtures.users.alice.username);

    const firstReadResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/read`)
      .set(authHeader(aliceToken))
      .send({});

    const secondReadResponse = await request(app)
      .post(`/api/conversations/${fixtures.conversations.privateAliceBob}/read`)
      .set(authHeader(aliceToken))
      .send({});

    expect(firstReadResponse.status).toBe(200);
    expect(firstReadResponse.body.data.lastReadMessageId).toBe(fixtures.messages.secondMessage);
    expect(secondReadResponse.status).toBe(200);
    expect(secondReadResponse.body.data.lastReadMessageId).toBeNull();
  });
});
