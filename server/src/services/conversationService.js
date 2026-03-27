import { StatusCodes } from 'http-status-codes';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import {
  readConversationListCache,
  writeConversationListCache,
} from './conversationCacheService.js';
import { ApiError } from '../utils/ApiError.js';
import { decodeCursor, encodeCursor } from '../utils/pagination.js';

const conversationPopulate = [
  { path: 'participants.user', select: 'username displayName avatar phone about isOnline lastSeen' },
  { path: 'lastMessage', populate: { path: 'sender', select: 'username displayName avatar' } },
];

const toStringId = (value) => String(value);
const buildPrivateConversationKey = (leftUserId, rightUserId) =>
  [toStringId(leftUserId), toStringId(rightUserId)].sort().join(':');

const populateConversationById = async (conversationId) => {
  let query = Conversation.findById(conversationId);
  for (const item of conversationPopulate) {
    query = query.populate(item);
  }
  return query;
};

export const ensurePrivateConversation = async (userId, peerUserId) => {
  if (userId === peerUserId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot create a private conversation with yourself');
  }

  const peerExists = await User.exists({ _id: peerUserId });
  if (!peerExists) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Peer user not found');
  }

  const [requester, peer] = await Promise.all([
    User.findById(userId).select('blockedUsers').lean(),
    User.findById(peerUserId).select('blockedUsers').lean(),
  ]);

  const requesterBlockedPeer = (requester?.blockedUsers || []).some(
    (blockedId) => toStringId(blockedId) === toStringId(peerUserId),
  );
  const peerBlockedRequester = (peer?.blockedUsers || []).some(
    (blockedId) => toStringId(blockedId) === toStringId(userId),
  );

  if (requesterBlockedPeer || peerBlockedRequester) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Cannot start conversation due to block settings');
  }

  const privateKey = buildPrivateConversationKey(userId, peerUserId);

  try {
    const conversation = await Conversation.findOneAndUpdate(
      {
        type: 'private',
        privateKey,
      },
      {
        $setOnInsert: {
          type: 'private',
          privateKey,
          participants: [
            { user: userId, role: 'member' },
            { user: peerUserId, role: 'member' },
          ],
          lastActivityAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    return populateConversationById(conversation.id);
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const existing = await Conversation.findOne({
      type: 'private',
      privateKey,
    }).populate(conversationPopulate);

    if (existing) {
      return existing;
    }

    throw error;
  }
};

export const listUserConversations = async ({ userId, limit = 20, cursor }) => {
  const cached = await readConversationListCache({ userId, limit, cursor });
  if (cached) {
    return cached;
  }

  const cursorDate = decodeCursor(cursor);

  const query = {
    'participants.user': userId,
  };

  if (cursorDate) {
    query.lastActivityAt = { $lt: cursorDate };
  }

  const items = await Conversation.find(query)
    .sort({ lastActivityAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate(conversationPopulate);

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? encodeCursor(pageItems[pageItems.length - 1].lastActivityAt) : null;

  const response = {
    items: pageItems,
    nextCursor,
  };

  await writeConversationListCache({
    userId,
    limit,
    cursor,
    data: {
      items: pageItems.map((item) => (item.toObject ? item.toObject() : item)),
      nextCursor,
    },
  });

  return response;
};

export const listUserConversationRoomIds = async ({ userId, limit = 500, cursor }) => {
  const cursorDate = decodeCursor(cursor);

  const query = {
    'participants.user': userId,
  };

  if (cursorDate) {
    query.lastActivityAt = { $lt: cursorDate };
  }

  const items = await Conversation.find(query)
    .sort({ lastActivityAt: -1, _id: -1 })
    .select('_id lastActivityAt')
    .limit(limit + 1)
    .lean();

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? encodeCursor(pageItems[pageItems.length - 1].lastActivityAt) : null;

  return {
    items: pageItems.map((item) => String(item._id)),
    nextCursor,
  };
};

export const ensureConversationMember = async (conversationId, userId) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    'participants.user': userId,
  });

  if (!conversation) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not a member of this conversation');
  }

  return conversation;
};

export const assertNotBlockedInConversation = async ({ conversation, senderId }) => {
  if (conversation.type !== 'private') return;

  const participantIds = (conversation.participants || []).map((participant) =>
    toStringId(participant.user),
  );

  if (participantIds.length !== 2) return;

  const peerId = participantIds.find((id) => id !== toStringId(senderId));
  if (!peerId) return;

  const [sender, peer] = await Promise.all([
    User.findById(senderId).select('blockedUsers').lean(),
    User.findById(peerId).select('blockedUsers').lean(),
  ]);

  const senderBlockedPeer = (sender?.blockedUsers || []).some(
    (blockedId) => toStringId(blockedId) === toStringId(peerId),
  );
  const peerBlockedSender = (peer?.blockedUsers || []).some(
    (blockedId) => toStringId(blockedId) === toStringId(senderId),
  );

  if (senderBlockedPeer || peerBlockedSender) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Messaging blocked between these users');
  }
};

export const createGroupConversation = async ({ creatorUserId, title, memberIds }) => {
  const uniqueMembers = [...new Set(memberIds.map(toStringId).filter(Boolean))].filter(
    (id) => id !== toStringId(creatorUserId),
  );

  if (uniqueMembers.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'At least one member is required');
  }

  const existingUsers = await User.find({ _id: { $in: uniqueMembers } }).select('_id').lean();
  const existingIds = new Set(existingUsers.map((user) => toStringId(user._id)));

  const missing = uniqueMembers.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, `Invalid member ids: ${missing.join(', ')}`);
  }

  const conversation = await Conversation.create({
    type: 'group',
    title,
    participants: [
      { user: creatorUserId, role: 'owner' },
      ...uniqueMembers.map((userId) => ({ user: userId, role: 'member' })),
    ],
    lastActivityAt: new Date(),
  });

  return populateConversationById(conversation.id);
};

const findParticipant = (conversation, userId) =>
  conversation.participants.find((participant) => toStringId(participant.user) === toStringId(userId));

const requireGroupConversation = (conversation) => {
  if (conversation.type !== 'group') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Operation only allowed in group conversations');
  }
};

const requireModeratorRole = (conversation, requesterId) => {
  const requester = findParticipant(conversation, requesterId);
  if (!requester || !['owner', 'admin'].includes(requester.role)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Only owner/admin can perform this operation');
  }
  return requester;
};

const requireOwnerRole = (conversation, requesterId) => {
  const requester = findParticipant(conversation, requesterId);
  if (!requester || requester.role !== 'owner') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Only owner can perform this operation');
  }
};

export const addGroupMembers = async ({ conversationId, requesterId, memberIds }) => {
  const conversation = await ensureConversationMember(conversationId, requesterId);
  requireGroupConversation(conversation);
  requireModeratorRole(conversation, requesterId);

  const currentIds = new Set(conversation.participants.map((entry) => toStringId(entry.user)));
  const uniqueMembers = [...new Set(memberIds.map(toStringId).filter(Boolean))].filter(
    (id) => !currentIds.has(id),
  );

  if (uniqueMembers.length === 0) {
    return populateConversationById(conversationId);
  }

  const existingUsers = await User.find({ _id: { $in: uniqueMembers } }).select('_id').lean();
  const existingIds = new Set(existingUsers.map((user) => toStringId(user._id)));
  const validMembers = uniqueMembers.filter((id) => existingIds.has(id));

  if (validMembers.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'No valid users to add');
  }

  await Conversation.findByIdAndUpdate(conversationId, {
    $push: {
      participants: {
        $each: validMembers.map((userId) => ({ user: userId, role: 'member' })),
      },
    },
    $set: { lastActivityAt: new Date() },
  });

  return populateConversationById(conversationId);
};

export const removeGroupMember = async ({ conversationId, requesterId, targetUserId }) => {
  const conversation = await ensureConversationMember(conversationId, requesterId);
  requireGroupConversation(conversation);

  const requester = requireModeratorRole(conversation, requesterId);
  const targetParticipant = findParticipant(conversation, targetUserId);
  if (!targetParticipant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Target member is not in the group');
  }

  if (targetParticipant.role === 'owner') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Owner cannot be removed');
  }

  if (requester.role === 'admin' && targetParticipant.role === 'admin') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Admin cannot remove another admin');
  }

  await Conversation.findByIdAndUpdate(conversationId, {
    $pull: {
      participants: {
        user: targetUserId,
      },
    },
    $set: { lastActivityAt: new Date() },
  });

  return populateConversationById(conversationId);
};

export const updateGroupMemberRole = async ({ conversationId, requesterId, targetUserId, role }) => {
  const conversation = await ensureConversationMember(conversationId, requesterId);
  requireGroupConversation(conversation);
  requireOwnerRole(conversation, requesterId);

  const targetParticipant = findParticipant(conversation, targetUserId);
  if (!targetParticipant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Target member is not in the group');
  }

  if (targetParticipant.role === 'owner') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot change owner role');
  }

  await Conversation.findOneAndUpdate(
    { _id: conversationId, 'participants.user': targetUserId },
    {
      $set: {
        'participants.$.role': role,
        lastActivityAt: new Date(),
      },
    },
  );

  return populateConversationById(conversationId);
};
