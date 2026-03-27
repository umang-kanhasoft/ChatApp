import crypto from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { StatusCodes } from 'http-status-codes';
import { created, ok } from '../utils/response.js';
import {
  addGroupMembers,
  assertNotBlockedInConversation,
  createGroupConversation,
  ensureConversationMember,
  ensurePrivateConversation,
  listUserConversations,
  removeGroupMember,
  updateGroupMemberRole,
} from '../services/conversationService.js';
import {
  bumpConversationListVersions,
  bumpConversationMembershipVersions,
} from '../services/conversationCacheService.js';
import {
  createMessage,
  deleteMessage,
  editMessage,
  forwardMessage,
  listMessages,
  markConversationRead,
  searchMessages,
  toggleMessagePin,
  toggleMessageStar,
  toggleReaction,
  votePollOption,
} from '../services/messageService.js';
import { ApiError } from '../utils/ApiError.js';
import { queuePushNotification } from '../queues/runtime.js';
import {
  cancelScheduledMessage,
  createScheduledMessage,
  listScheduledMessagesForUser,
  mapScheduledMessage,
} from '../services/scheduledMessageService.js';
import {
  emitScheduledMessageCanceled,
  emitScheduledMessageCreated,
} from '../socket/events/scheduledMessageEvents.js';
import { uploadToCloudinary } from '../services/media.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { normalizePhone } from '../utils/phone.js';

const toStringId = (value) => String(value);

const getParticipantIds = (conversation) =>
  (conversation?.participants || []).map((participant) => toStringId(participant.user?._id || participant.user));

const getRecipientIds = (conversation, senderId) =>
  getParticipantIds(conversation).filter((userId) => userId !== toStringId(senderId));

const enqueuePush = (payload) => {
  void queuePushNotification(payload).catch((error) => {
    logger.warn('failed to enqueue push notification', { error });
  });
};

const emitConversationUpdate = (io, conversation) => {
  if (!io || !conversation) return;
  for (const userId of getParticipantIds(conversation)) {
    io.to(`user:${userId}`).emit('conversation:update', conversation);
  }
};

export const createPrivateConversation = asyncHandler(async (req, res) => {
  const { peerUserId, phone } = req.validatedBody;
  let targetUserId = peerUserId;

  if (phone && !peerUserId) {
    const normalizedPhone = normalizePhone(phone);
    const peer = normalizedPhone ? await User.findOne({ phone: normalizedPhone }).select('_id') : null;
    if (!peer) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'User with this phone was not found');
    }
    targetUserId = peer._id.toString();
  }

  if (!targetUserId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Provide peer user id or phone');
  }

  const conversation = await ensurePrivateConversation(req.user.id, targetUserId);
  const io = req.app.get('io');
  if (io) {
    for (const userId of getParticipantIds(conversation)) {
      io.in(`user:${userId}`).socketsJoin(`conversation:${conversation.id}`);
    }
    emitConversationUpdate(io, conversation);
  }

  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });
  await bumpConversationMembershipVersions({
    userIds: getParticipantIds(conversation),
  });

  created(res, conversation);
});

export const getConversations = asyncHandler(async (req, res) => {
  const data = await listUserConversations({
    userId: req.user.id,
    limit: req.validatedQuery.limit,
    cursor: req.validatedQuery.cursor,
  });

  ok(res, data.items, {
    nextCursor: data.nextCursor,
  });
});

export const getConversationMessages = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const data = await listMessages({
    conversationId: req.params.conversationId,
    userId: req.user.id,
    limit: req.validatedQuery.limit,
    cursor: req.validatedQuery.cursor,
  });

  ok(res, data.items, {
    nextCursor: data.nextCursor,
  });
});

export const sendConversationMessage = asyncHandler(async (req, res) => {
  const conversation = await ensureConversationMember(req.params.conversationId, req.user.id);
  await assertNotBlockedInConversation({ conversation, senderId: req.user.id });

  const message = await createMessage({
    conversationId: req.params.conversationId,
    senderId: req.user.id,
    clientMessageId: req.validatedBody.clientMessageId,
    type: req.validatedBody.type,
    text: req.validatedBody.text,
    replyTo: req.validatedBody.replyTo,
    media: req.validatedBody.media,
    poll: req.validatedBody.poll,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:new', message);
  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });

  enqueuePush({
    userIds: getRecipientIds(conversation, req.user.id),
    title: req.user.displayName || req.user.username,
    body:
      message.type === 'text'
        ? message.content?.text || 'New message'
        : `${req.user.displayName || req.user.username} sent ${message.type}`,
    url: '/chat',
    conversationId: req.params.conversationId,
    senderName: req.user.displayName || req.user.username,
  });

  created(res, message);
});

export const uploadConversationMedia = asyncHandler(async (req, res) => {
  const conversation = await ensureConversationMember(req.params.conversationId, req.user.id);
  await assertNotBlockedInConversation({ conversation, senderId: req.user.id });

  if (!req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'No file uploaded');
  }

  const mimeType = req.file.mimetype;
  const type = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('video/')
      ? 'video'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : 'document';

  const cloud = await uploadToCloudinary({
    filePath: req.file.path,
    folder: `chatapp/conversations/${req.params.conversationId}`,
    resourceType: type === 'document' ? 'raw' : 'auto',
  });

  const mediaUrl = cloud.secureUrl || `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  const message = await createMessage({
    conversationId: req.params.conversationId,
    senderId: req.user.id,
    clientMessageId:
      typeof req.body?.clientMessageId === 'string' && req.body.clientMessageId.trim()
        ? req.body.clientMessageId.trim()
        : crypto.randomUUID(),
    type,
    text: req.body?.text || '',
    media: {
      url: mediaUrl,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: cloud.bytes || req.file.size,
      width: cloud.width,
      height: cloud.height,
      publicId: cloud.publicId,
    },
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:new', message);
  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });

  enqueuePush({
    userIds: getRecipientIds(conversation, req.user.id),
    title: req.user.displayName || req.user.username,
    body: `${req.user.displayName || req.user.username} sent ${type}`,
    url: '/chat',
    conversationId: req.params.conversationId,
    senderName: req.user.displayName || req.user.username,
  });

  created(res, message);
});

export const editConversationMessage = asyncHandler(async (req, res) => {
  const conversation = await ensureConversationMember(req.params.conversationId, req.user.id);

  const message = await editMessage({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    userId: req.user.id,
    text: req.validatedBody.text,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:update', message);
  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });

  ok(res, message);
});

export const deleteConversationMessage = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const message = await deleteMessage({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    userId: req.user.id,
    scope: req.validatedQuery.scope,
  });

  const io = req.app.get('io');
  if (req.validatedQuery.scope === 'everyone') {
    io?.to(`conversation:${req.params.conversationId}`).emit('message:update', message);
  } else {
    io?.to(`user:${req.user.id}`).emit('message:remove-self', {
      conversationId: req.params.conversationId,
      messageId: req.params.messageId,
    });
  }

  await bumpConversationListVersions({
    userIds: [req.user.id],
  });

  ok(res, message);
});

export const reactConversationMessage = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const message = await toggleReaction({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    userId: req.user.id,
    emoji: req.validatedBody.emoji,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:update', message);

  ok(res, message);
});

export const voteConversationPoll = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const message = await votePollOption({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    userId: req.user.id,
    optionIndex: req.validatedBody.optionIndex,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:update', message);

  ok(res, message);
});

export const starConversationMessage = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const message = await toggleMessageStar({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    userId: req.user.id,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:update', message);

  ok(res, message);
});

export const pinConversationMessage = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const result = await toggleMessagePin({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    userId: req.user.id,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${req.params.conversationId}`).emit('message:update', result.message);
  io?.to(`conversation:${req.params.conversationId}`).emit('conversation:pins-update', {
    conversationId: req.params.conversationId,
    pinnedMessageIds: result.pinnedMessageIds,
  });

  ok(res, result.message, {
    pinnedMessageIds: result.pinnedMessageIds,
  });
});

export const forwardConversationMessage = asyncHandler(async (req, res) => {
  const sourceConversation = await ensureConversationMember(req.params.conversationId, req.user.id);
  const targetConversation = await ensureConversationMember(
    req.validatedBody.targetConversationId,
    req.user.id,
  );
  await assertNotBlockedInConversation({ conversation: targetConversation, senderId: req.user.id });

  const message = await forwardMessage({
    sourceConversationId: sourceConversation.id,
    sourceMessageId: req.params.messageId,
    targetConversationId: targetConversation.id,
    senderId: req.user.id,
  });

  const io = req.app.get('io');
  io?.to(`conversation:${targetConversation.id}`).emit('message:new', message);
  await bumpConversationListVersions({
    userIds: getParticipantIds(targetConversation),
  });

  enqueuePush({
    userIds: getRecipientIds(targetConversation, req.user.id),
    title: req.user.displayName || req.user.username,
    body:
      message.type === 'text'
        ? message.content?.text || 'Forwarded message'
        : `${req.user.displayName || req.user.username} forwarded ${message.type}`,
    url: '/chat',
    conversationId: targetConversation.id,
    senderName: req.user.displayName || req.user.username,
  });

  created(res, message);
});

export const scheduleConversationMessage = asyncHandler(async (req, res) => {
  const conversation = await ensureConversationMember(req.params.conversationId, req.user.id);
  await assertNotBlockedInConversation({ conversation, senderId: req.user.id });

  const scheduled = await createScheduledMessage({
    conversationId: req.params.conversationId,
    senderId: req.user.id,
    clientMessageId: req.validatedBody.clientMessageId,
    text: req.validatedBody.text,
    replyTo: req.validatedBody.replyTo,
    runAt: req.validatedBody.scheduledFor,
    recurrence: req.validatedBody.recurrence,
  });

  const mapped = mapScheduledMessage(scheduled);
  const io = req.app.get('io');
  emitScheduledMessageCreated({ io, scheduledMessage: mapped });

  created(res, mapped);
});

export const getConversationScheduledMessages = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const items = await listScheduledMessagesForUser({
    conversationId: req.params.conversationId,
    userId: req.user.id,
    limit: req.validatedQuery.limit,
  });

  ok(res, items.map(mapScheduledMessage));
});

export const cancelConversationScheduledMessage = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const item = await cancelScheduledMessage({
    scheduledMessageId: req.params.scheduledMessageId,
    conversationId: req.params.conversationId,
    userId: req.user.id,
  });

  const mapped = mapScheduledMessage(item);
  const io = req.app.get('io');
  emitScheduledMessageCanceled({ io, scheduledMessage: mapped });

  ok(res, mapped);
});

export const searchConversationMessages = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const items = await searchMessages({
    conversationId: req.params.conversationId,
    userId: req.user.id,
    query: req.validatedQuery.q,
    limit: req.validatedQuery.limit,
  });

  ok(res, items);
});

export const createGroup = asyncHandler(async (req, res) => {
  const conversation = await createGroupConversation({
    creatorUserId: req.user.id,
    title: req.validatedBody.title,
    memberIds: req.validatedBody.memberIds,
  });

  const io = req.app.get('io');
  emitConversationUpdate(io, conversation);
  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });
  await bumpConversationMembershipVersions({
    userIds: getParticipantIds(conversation),
  });

  created(res, conversation);
});

export const addMembersToGroup = asyncHandler(async (req, res) => {
  const conversation = await addGroupMembers({
    conversationId: req.params.conversationId,
    requesterId: req.user.id,
    memberIds: req.validatedBody.memberIds,
  });

  const io = req.app.get('io');
  emitConversationUpdate(io, conversation);
  io?.to(`conversation:${req.params.conversationId}`).emit('group:members-updated', conversation);
  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });
  await bumpConversationMembershipVersions({
    userIds: getParticipantIds(conversation),
  });

  ok(res, conversation);
});

export const removeMemberFromGroup = asyncHandler(async (req, res) => {
  const conversation = await removeGroupMember({
    conversationId: req.params.conversationId,
    requesterId: req.user.id,
    targetUserId: req.params.userId,
  });
  const affectedUserIds = [...new Set([...getParticipantIds(conversation), req.params.userId])];

  const io = req.app.get('io');
  emitConversationUpdate(io, conversation);
  io?.to(`conversation:${req.params.conversationId}`).emit('group:members-updated', conversation);
  await bumpConversationListVersions({
    userIds: affectedUserIds,
  });
  await bumpConversationMembershipVersions({
    userIds: affectedUserIds,
  });

  ok(res, conversation);
});

export const updateMemberRoleInGroup = asyncHandler(async (req, res) => {
  const conversation = await updateGroupMemberRole({
    conversationId: req.params.conversationId,
    requesterId: req.user.id,
    targetUserId: req.params.userId,
    role: req.validatedBody.role,
  });

  const io = req.app.get('io');
  emitConversationUpdate(io, conversation);
  io?.to(`conversation:${req.params.conversationId}`).emit('group:members-updated', conversation);
  await bumpConversationListVersions({
    userIds: getParticipantIds(conversation),
  });

  ok(res, conversation);
});

export const markConversationAsRead = asyncHandler(async (req, res) => {
  await ensureConversationMember(req.params.conversationId, req.user.id);

  const receipt = await markConversationRead({
    conversationId: req.params.conversationId,
    userId: req.user.id,
  });

  const io = req.app.get('io');
  if (receipt.lastReadMessageId || receipt.lastDeliveredMessageId) {
    io?.to(`conversation:${req.params.conversationId}`).emit('message:read-update', {
      conversationId: req.params.conversationId,
      ...receipt,
    });
  }
  await bumpConversationListVersions({
    userIds: [req.user.id],
  });

  ok(res, receipt);
});
