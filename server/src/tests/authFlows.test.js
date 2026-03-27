import request from 'supertest';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { Message } from '../models/Message.js';
import { OtpCode } from '../models/OtpCode.js';
import { User } from '../models/User.js';
import { useMongoTestDb } from './helpers/testDb.js';

const app = createApp();

const registerUser = async ({
  email = 'alice@example.com',
  phone = '+15550000001',
  username = 'alice',
  displayName = 'Alice',
  password = 'Password123',
} = {}) =>
  request(app).post('/api/auth/register').send({
    email,
    phone,
    username,
    displayName,
    password,
  });

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

describe('auth and messaging release flows', () => {
  useMongoTestDb();

  it('rotates refresh tokens once and revokes all sessions on reuse detection', async () => {
    const registerResponse = await registerUser();
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.data.session.id).toBeTruthy();

    const firstRefreshToken = registerResponse.body.data.refreshToken;

    const refreshResponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefreshToken });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.data.refreshToken).not.toBe(firstRefreshToken);
    expect(refreshResponse.body.data.session.id).not.toBe(registerResponse.body.data.session.id);

    const reuseResponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefreshToken });

    expect(reuseResponse.status).toBe(401);
    expect(reuseResponse.body.error.code).toBe('TOKEN_REUSED');
    expect(reuseResponse.body.error.requestId).toBeTruthy();

    const compromisedResponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshResponse.body.data.refreshToken });

    expect(compromisedResponse.status).toBe(401);
    expect(compromisedResponse.body.error.code).toBe('TOKEN_REUSED');
  });

  it('revokes all sessions explicitly via logout-all', async () => {
    const registerResponse = await registerUser();
    const accessToken = registerResponse.body.data.accessToken;
    const refreshToken = registerResponse.body.data.refreshToken;

    const logoutAllResponse = await request(app)
      .post('/api/auth/logout-all')
      .set(authHeader(accessToken))
      .send({});

    expect(logoutAllResponse.status).toBe(200);
    expect(logoutAllResponse.body.data.message).toMatch(/all sessions/i);

    const refreshResponse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshResponse.status).toBe(401);
    expect(refreshResponse.body.error.code).toBe('AUTH_INVALID');
  });

  it('does not allow the removed OTP bypass code', async () => {
    await registerUser();

    const requestResponse = await request(app)
      .post('/api/auth/otp/request')
      .send({ phone: '+15550000001' });

    expect(requestResponse.status).toBe(200);
    expect(requestResponse.body.data.sent).toBe(true);

    const verifyResponse = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+15550000001', code: '111111' });

    expect(verifyResponse.status).toBe(401);
    expect(verifyResponse.body.error.code).toBe('OTP_INVALID');
  });

  it('allows OTP login when legacy refresh token records are missing session ids', async () => {
    const registerResponse = await registerUser();
    const userId = registerResponse.body.data.user.id;
    const phone = '+15550000001';
    const now = new Date();
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          refreshTokens: Array.from({ length: 5 }, (_, index) => ({
            tokenHash: `legacy-token-hash-${index}`,
            status: 'active',
            expiresAt: futureDate,
            createdAt: now,
            lastUsedAt: now,
          })),
        },
      },
    );

    await OtpCode.create({
      phone,
      codeHash: await bcrypt.hash('654321', 10),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: futureDate,
      consumed: false,
    });

    const verifyResponse = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, code: '654321' });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.data.session.id).toBeTruthy();

    const refreshedUser = await User.findById(userId).select('+refreshTokens').lean();

    expect(refreshedUser.refreshTokens).toHaveLength(1);
    expect(refreshedUser.refreshTokens[0].sessionId).toBeTruthy();
  });

  it('fails closed for email OTP when delivery is unavailable', async () => {
    await registerUser();

    const response = await request(app)
      .post('/api/auth/otp/email/request')
      .send({ email: 'alice@example.com' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('EMAIL_OTP_UNAVAILABLE');
  });

  it('deduplicates message creation by clientMessageId and keeps read receipts idempotent', async () => {
    const aliceRegister = await registerUser();
    const bobRegister = await registerUser({
      email: 'bob@example.com',
      phone: '+15550000002',
      username: 'bob',
      displayName: 'Bob',
    });

    const aliceAccessToken = aliceRegister.body.data.accessToken;
    const bobAccessToken = bobRegister.body.data.accessToken;

    const conversationResponse = await request(app)
      .post('/api/conversations/private')
      .set(authHeader(aliceAccessToken))
      .send({ peerUserId: bobRegister.body.data.user.id });

    expect(conversationResponse.status).toBe(201);
    const conversationId = conversationResponse.body.data._id;

    const firstMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(authHeader(aliceAccessToken))
      .send({
        clientMessageId: 'client-msg-1',
        type: 'text',
        text: 'hello bob',
      });

    const duplicateMessageResponse = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(authHeader(aliceAccessToken))
      .send({
        clientMessageId: 'client-msg-1',
        type: 'text',
        text: 'hello bob',
      });

    expect(firstMessageResponse.status).toBe(201);
    expect(duplicateMessageResponse.status).toBe(201);
    expect(duplicateMessageResponse.body.data._id).toBe(firstMessageResponse.body.data._id);

    const storedMessages = await Message.find({ conversation: conversationId });
    expect(storedMessages).toHaveLength(1);

    const firstReadResponse = await request(app)
      .post(`/api/conversations/${conversationId}/read`)
      .set(authHeader(bobAccessToken))
      .send({});

    const secondReadResponse = await request(app)
      .post(`/api/conversations/${conversationId}/read`)
      .set(authHeader(bobAccessToken))
      .send({});

    expect(firstReadResponse.status).toBe(200);
    expect(secondReadResponse.status).toBe(200);

    const refreshedMessage = await Message.findById(firstMessageResponse.body.data._id).lean();
    const bobReadEntries = (refreshedMessage.readBy || []).filter(
      (entry) => String(entry.user) === String(bobRegister.body.data.user.id),
    );
    const bobDeliveredEntries = (refreshedMessage.deliveredTo || []).filter(
      (entry) => String(entry.user) === String(bobRegister.body.data.user.id),
    );

    expect(bobReadEntries).toHaveLength(1);
    expect(bobDeliveredEntries).toHaveLength(1);
  });
});
