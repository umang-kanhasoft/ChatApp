import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { CallLog } from '../models/CallLog.js';
import { Conversation } from '../models/Conversation.js';
import { GroupCallSession } from '../models/GroupCallSession.js';
import { Message } from '../models/Message.js';
import { Status } from '../models/Status.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { resetRateLimiters } from '../middleware/rateLimiter.js';
import { resetSocketEventRateLimits } from '../socket/socketRateLimit.js';
import { qaRouteManifest, qaSocketEventManifest } from './manifest.js';

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const defaultPassword = 'Password123';
const defaultOtpCode = env.TEST_OTP_CODE || '123456';
const createBaseTime = () => new Date(Date.now() - 15 * 60 * 1000);

const userFixtures = [
  {
    key: 'alice',
    email: 'alice@example.com',
    phone: '+15550000001',
    username: 'alice',
    displayName: 'Alice QA',
    avatar: '🦊',
    about: 'Leading QA test user',
  },
  {
    key: 'bob',
    email: 'bob@example.com',
    phone: '+15550000002',
    username: 'bob',
    displayName: 'Bob QA',
    avatar: '🐼',
    about: 'Realtime receiver',
  },
  {
    key: 'carol',
    email: 'carol@example.com',
    phone: '+15550000003',
    username: 'carol',
    displayName: 'Carol QA',
    avatar: '🐙',
    about: 'Observer and status viewer',
  },
  {
    key: 'dave',
    email: 'dave@example.com',
    phone: '+15550000004',
    username: 'dave',
    displayName: 'Dave QA',
    avatar: '🦉',
    about: 'Unauthorized outsider',
  },
];

const clearUploads = async () => {
  await fs.mkdir(uploadsDir, { recursive: true });
  const entries = await fs.readdir(uploadsDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(uploadsDir, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(absolutePath, { recursive: true, force: true });
        return;
      }

      await fs.unlink(absolutePath).catch(() => {});
    }),
  );
};

export const resetQaState = async () => {
  await resetRateLimiters();
  resetSocketEventRateLimits();

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.dropDatabase();
  }

  await clearUploads();
};

const buildParticipant = (userId, baseTime, role = 'member') => ({
  user: userId,
  role,
  joinedAt: baseTime,
  unreadCount: 0,
  lastDeliveredMessage: null,
  lastDeliveredAt: null,
  lastReadMessage: null,
  lastReadAt: null,
  isMuted: false,
});

const toStringId = (value) => String(value);

export const seedQaState = async () => {
  await resetQaState();
  const baseTime = createBaseTime();

  const passwordHash = await User.hashPassword(defaultPassword);
  const users = {};

  for (const fixture of userFixtures) {
    const user = await User.create({
      ...fixture,
      passwordHash,
      contacts: [],
      blockedUsers: [],
      isOnline: false,
      lastSeen: baseTime,
    });
    users[fixture.key] = user;
  }

  users.alice.contacts = [users.bob._id, users.carol._id];
  users.bob.contacts = [users.alice._id];
  users.carol.contacts = [users.alice._id];
  await Promise.all(Object.values(users).map((user) => user.save()));

  const privateAliceBob = await Conversation.create({
    type: 'private',
    title: '',
    avatar: '',
    privateKey: [users.alice._id, users.bob._id].map(toStringId).sort().join(':'),
    participants: [
      buildParticipant(users.alice._id, baseTime, 'owner'),
      buildParticipant(users.bob._id, baseTime, 'member'),
    ],
    lastActivityAt: new Date(baseTime.getTime() + 2 * 60 * 1000),
  });

  const privateAliceCarol = await Conversation.create({
    type: 'private',
    title: '',
    avatar: '',
    privateKey: [users.alice._id, users.carol._id].map(toStringId).sort().join(':'),
    participants: [
      buildParticipant(users.alice._id, baseTime, 'owner'),
      buildParticipant(users.carol._id, baseTime, 'member'),
    ],
    lastActivityAt: new Date(baseTime.getTime() + 4 * 60 * 1000),
  });

  const weekendGroup = await Conversation.create({
    type: 'group',
    title: 'Weekend Plans',
    avatar: '🏕️',
    participants: [
      buildParticipant(users.alice._id, baseTime, 'owner'),
      buildParticipant(users.bob._id, baseTime, 'admin'),
      buildParticipant(users.carol._id, baseTime, 'member'),
    ],
    lastActivityAt: new Date(baseTime.getTime() + 6 * 60 * 1000),
  });

  const firstMessage = await Message.create({
    conversation: privateAliceBob._id,
    sender: users.alice._id,
    clientMessageId: 'seed-msg-1',
    type: 'text',
    content: { text: 'Hello Bob', mediaUrl: '', fileName: '', mimeType: '', fileSize: 0 },
    deliveredTo: [
      { user: users.alice._id, at: new Date(baseTime.getTime() + 60 * 1000) },
      { user: users.bob._id, at: new Date(baseTime.getTime() + 90 * 1000) },
    ],
    readBy: [{ user: users.alice._id, at: new Date(baseTime.getTime() + 60 * 1000) }],
    createdAt: new Date(baseTime.getTime() + 60 * 1000),
    updatedAt: new Date(baseTime.getTime() + 60 * 1000),
  });

  const secondMessage = await Message.create({
    conversation: privateAliceBob._id,
    sender: users.bob._id,
    clientMessageId: 'seed-msg-2',
    type: 'text',
    content: { text: 'Hi Alice', mediaUrl: '', fileName: '', mimeType: '', fileSize: 0 },
    deliveredTo: [
      { user: users.alice._id, at: new Date(baseTime.getTime() + 120 * 1000) },
      { user: users.bob._id, at: new Date(baseTime.getTime() + 120 * 1000) },
    ],
    readBy: [{ user: users.bob._id, at: new Date(baseTime.getTime() + 120 * 1000) }],
    createdAt: new Date(baseTime.getTime() + 120 * 1000),
    updatedAt: new Date(baseTime.getTime() + 120 * 1000),
  });

  privateAliceBob.lastMessage = secondMessage._id;
  privateAliceBob.lastActivityAt = secondMessage.createdAt;
  privateAliceBob.participants = privateAliceBob.participants.map((participant) => {
    const participantId = toStringId(participant.user);
    if (participantId === toStringId(users.alice._id)) {
      return {
        ...participant.toObject(),
        unreadCount: 1,
        lastDeliveredMessage: secondMessage._id,
        lastDeliveredAt: secondMessage.createdAt,
        lastReadMessage: firstMessage._id,
        lastReadAt: firstMessage.createdAt,
      };
    }

    return {
      ...participant.toObject(),
      unreadCount: 0,
      lastDeliveredMessage: secondMessage._id,
      lastDeliveredAt: secondMessage.createdAt,
      lastReadMessage: secondMessage._id,
      lastReadAt: secondMessage.createdAt,
    };
  });
  await privateAliceBob.save();

  const groupMessage = await Message.create({
    conversation: weekendGroup._id,
    sender: users.alice._id,
    clientMessageId: 'seed-group-1',
    type: 'text',
    content: { text: 'Ready for the trip?', mediaUrl: '', fileName: '', mimeType: '', fileSize: 0 },
    deliveredTo: [{ user: users.alice._id, at: new Date(baseTime.getTime() + 360 * 1000) }],
    readBy: [{ user: users.alice._id, at: new Date(baseTime.getTime() + 360 * 1000) }],
    createdAt: new Date(baseTime.getTime() + 360 * 1000),
    updatedAt: new Date(baseTime.getTime() + 360 * 1000),
  });

  weekendGroup.lastMessage = groupMessage._id;
  weekendGroup.lastActivityAt = groupMessage.createdAt;
  await weekendGroup.save();

  const statuses = {
    alicePublic: await Status.create({
      user: users.alice._id,
      type: 'text',
      text: 'Alice status update',
      privacy: 'all',
      allowedUsers: [],
      createdAt: new Date(baseTime.getTime() + 8 * 60 * 1000),
      updatedAt: new Date(baseTime.getTime() + 8 * 60 * 1000),
      expiresAt: new Date(baseTime.getTime() + 24 * 60 * 60 * 1000),
    }),
    bobContacts: await Status.create({
      user: users.bob._id,
      type: 'text',
      text: 'Bob contacts only',
      privacy: 'contacts',
      allowedUsers: [],
      createdAt: new Date(baseTime.getTime() + 9 * 60 * 1000),
      updatedAt: new Date(baseTime.getTime() + 9 * 60 * 1000),
      expiresAt: new Date(baseTime.getTime() + 24 * 60 * 60 * 1000),
    }),
    carolPrivate: await Status.create({
      user: users.carol._id,
      type: 'text',
      text: 'Carol private story',
      privacy: 'private',
      allowedUsers: [users.carol._id],
      createdAt: new Date(baseTime.getTime() + 10 * 60 * 1000),
      updatedAt: new Date(baseTime.getTime() + 10 * 60 * 1000),
      expiresAt: new Date(baseTime.getTime() + 24 * 60 * 60 * 1000),
    }),
  };

  const callLog = await CallLog.create({
    conversation: privateAliceBob._id,
    caller: users.alice._id,
    callee: users.bob._id,
    type: 'voice',
    status: 'completed',
    startedAt: new Date(baseTime.getTime() + 12 * 60 * 1000),
    endedAt: new Date(baseTime.getTime() + 13 * 60 * 1000),
    duration: 60,
    createdAt: new Date(baseTime.getTime() + 12 * 60 * 1000),
    updatedAt: new Date(baseTime.getTime() + 13 * 60 * 1000),
  });

  const groupCallSession = await GroupCallSession.create({
    conversation: weekendGroup._id,
    host: users.alice._id,
    type: 'video',
    status: 'active',
    participants: [
      { user: users.alice._id, joinedAt: new Date(baseTime.getTime() + 14 * 60 * 1000) },
      { user: users.bob._id, joinedAt: new Date(baseTime.getTime() + 15 * 60 * 1000) },
    ],
    createdAt: new Date(baseTime.getTime() + 14 * 60 * 1000),
    updatedAt: new Date(baseTime.getTime() + 15 * 60 * 1000),
  });

  return {
    manifest: {
      routes: qaRouteManifest,
      socketEvents: qaSocketEventManifest,
    },
    uploads: {
      directory: uploadsDir,
      exists: true,
    },
    credentials: {
      password: defaultPassword,
      otpCode: defaultOtpCode,
    },
    users: Object.fromEntries(
      Object.entries(users).map(([key, user]) => [
        key,
        {
          id: user.id,
          email: user.email,
          phone: user.phone,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          password: defaultPassword,
          otpCode: defaultOtpCode,
        },
      ]),
    ),
    conversations: {
      privateAliceBob: privateAliceBob.id,
      privateAliceCarol: privateAliceCarol.id,
      weekendGroup: weekendGroup.id,
    },
    messages: {
      firstMessage: firstMessage.id,
      secondMessage: secondMessage.id,
      groupMessage: groupMessage.id,
    },
    statuses: {
      alicePublic: statuses.alicePublic.id,
      bobContacts: statuses.bobContacts.id,
      carolPrivate: statuses.carolPrivate.id,
    },
    calls: {
      directCall: callLog.id,
      activeGroupCall: groupCallSession.id,
    },
  };
};
