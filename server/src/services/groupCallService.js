import { StatusCodes } from 'http-status-codes';
import { GroupCallSession } from '../models/GroupCallSession.js';
import { ApiError } from '../utils/ApiError.js';

const toStringId = (value) => String(value);

const populateSession = (query) =>
  query
    .populate('host', '_id username displayName avatar')
    .populate('participants.user', '_id username displayName avatar')
    .populate('conversation', '_id type title participants');

const findSessionById = async (sessionId) => {
  const session = await GroupCallSession.findById(sessionId);
  if (!session) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group call session not found');
  }
  return session;
};

export const getGroupCallSessionById = async ({ sessionId }) =>
  populateSession(GroupCallSession.findById(sessionId));

export const getActiveGroupCallSessionByConversation = async ({ conversationId }) =>
  populateSession(
    GroupCallSession.findOne({
      conversation: conversationId,
      status: 'active',
    }),
  );

export const createOrGetGroupCallSession = async ({ conversationId, hostId, type }) => {
  const existing = await getActiveGroupCallSessionByConversation({ conversationId });
  if (existing) return existing;

  const session = await GroupCallSession.create({
    conversation: conversationId,
    host: hostId,
    type,
    participants: [{ user: hostId }],
  });

  return populateSession(GroupCallSession.findById(session.id));
};

export const joinGroupCallSession = async ({ sessionId, userId }) => {
  const session = await findSessionById(sessionId);
  if (session.status !== 'active') {
    throw new ApiError(StatusCodes.CONFLICT, 'Group call session is not active');
  }

  const isAlreadyParticipant = session.participants.some(
    (entry) => toStringId(entry.user) === toStringId(userId),
  );

  if (!isAlreadyParticipant) {
    session.participants.push({
      user: userId,
      joinedAt: new Date(),
    });
    await session.save();
  }

  return populateSession(GroupCallSession.findById(session.id));
};

export const leaveGroupCallSession = async ({ sessionId, userId }) => {
  const session = await findSessionById(sessionId);

  if (session.status !== 'active') {
    return populateSession(GroupCallSession.findById(session.id));
  }

  session.participants = session.participants.filter(
    (entry) => toStringId(entry.user) !== toStringId(userId),
  );

  if (session.participants.length === 0) {
    session.status = 'ended';
    session.endedAt = new Date();
  }

  await session.save();
  return populateSession(GroupCallSession.findById(session.id));
};

export const endGroupCallSession = async ({ sessionId }) => {
  const session = await findSessionById(sessionId);
  if (session.status === 'ended') {
    return populateSession(GroupCallSession.findById(session.id));
  }

  session.status = 'ended';
  session.endedAt = new Date();
  await session.save();

  return populateSession(GroupCallSession.findById(session.id));
};

export const isGroupCallParticipant = ({ session, userId }) =>
  (session?.participants || []).some((entry) => toStringId(entry.user?._id || entry.user) === toStringId(userId));

export const listGroupCallParticipantIds = ({ session }) =>
  (session?.participants || []).map((entry) => toStringId(entry.user?._id || entry.user));

export const leaveUserFromAllActiveGroupCalls = async ({ userId }) => {
  const sessions = await GroupCallSession.find({
    status: 'active',
    'participants.user': userId,
  });

  const updatedSessions = [];
  for (const session of sessions) {
    session.participants = session.participants.filter(
      (entry) => toStringId(entry.user) !== toStringId(userId),
    );

    if (session.participants.length === 0) {
      session.status = 'ended';
      session.endedAt = new Date();
    }

    await session.save();
    const populated = await populateSession(GroupCallSession.findById(session.id));
    if (populated) {
      updatedSessions.push(populated);
    }
  }

  return updatedSessions;
};
