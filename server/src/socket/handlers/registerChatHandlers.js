import { z } from 'zod';
import { env } from '../../config/env.js';
import { queuePushNotification, scheduleCallRingTimeout, cancelCallRingTimeout } from '../../queues/runtime.js';
import { bumpConversationListVersions } from '../../services/conversationCacheService.js';
import {
  assertNotBlockedInConversation,
  ensureConversationMember,
  listUserConversationRoomIds,
} from '../../services/conversationService.js';
import {
  acceptCallLog,
  createCallLog,
  declineCallLog,
  endCallLog,
  getCallLogById,
} from '../../services/callService.js';
import {
  createOrGetGroupCallSession,
  endGroupCallSession,
  getGroupCallSessionById,
  isGroupCallParticipant,
  joinGroupCallSession,
  leaveGroupCallSession,
  listGroupCallParticipantIds,
} from '../../services/groupCallService.js';
import {
  createMessage,
  deleteMessage,
  editMessage,
  forwardMessage,
  markConversationRead,
  markMessageDelivered,
  toggleMessagePin,
  toggleMessageStar,
  toggleReaction,
} from '../../services/messageService.js';
import { logger } from '../../utils/logger.js';

const joinSchema = z.object({
  conversationId: z.string().min(1),
});

const joinAllSchema = z.object({
  cursor: z.string().optional().nullable(),
  limit: z.coerce.number().int().min(50).max(env.SOCKET_JOIN_ALL_BATCH_SIZE).optional(),
});

const messageSendSchema = z.object({
  conversationId: z.string().min(1),
  clientMessageId: z.string().min(1).max(100).optional(),
  type: z.enum(['text', 'image', 'video', 'audio', 'document']).default('text'),
  text: z.string().max(5000).optional(),
  replyTo: z.string().optional().nullable(),
  clientId: z.string().optional(),
});

const typingSchema = z.object({
  conversationId: z.string().min(1),
});

const editSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  text: z.string().min(1).max(5000),
});

const deleteSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  scope: z.enum(['me', 'everyone']).default('me'),
});

const reactionSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  emoji: z.string().min(1).max(32),
});

const starSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

const pinSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

const forwardSchema = z.object({
  sourceConversationId: z.string().min(1),
  messageId: z.string().min(1),
  targetConversationId: z.string().min(1),
});

const deliveredSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

const readSchema = z.object({
  conversationId: z.string().min(1),
});

const callInitiateSchema = z.object({
  conversationId: z.string().min(1),
  type: z.enum(['voice', 'video']).default('voice'),
});

const callDecisionSchema = z.object({
  callId: z.string().min(1),
});

const callSignalSchema = z.object({
  callId: z.string().min(1),
  toUserId: z.string().min(1),
  signal: z.any(),
});

const callEndSchema = z.object({
  callId: z.string().min(1),
  duration: z.coerce.number().optional(),
});

const groupCallStartSchema = z.object({
  conversationId: z.string().min(1),
  type: z.enum(['voice', 'video']).default('voice'),
});

const groupCallSessionSchema = z.object({
  sessionId: z.string().min(1),
});

const groupCallSignalSchema = z.object({
  sessionId: z.string().min(1),
  toUserId: z.string().min(1),
  signal: z.any(),
});

const groupCallMediaStateSchema = z
  .object({
    sessionId: z.string().min(1),
    audioEnabled: z.boolean().optional(),
    videoEnabled: z.boolean().optional(),
  })
  .refine(
    (payload) => typeof payload.audioEnabled === 'boolean' || typeof payload.videoEnabled === 'boolean',
    {
      message: 'At least one media state field is required',
    },
  );

const groupCallMuteUserSchema = z.object({
  sessionId: z.string().min(1),
  targetUserId: z.string().min(1),
  muteAudio: z.boolean().default(true),
});

const toStringId = (value) => String(value);
const participantIds = (conversation) =>
  (conversation?.participants || []).map((participant) => toStringId(participant.user));
const recipientIds = (conversation, senderId) =>
  participantIds(conversation).filter((id) => id !== toStringId(senderId));

const isCallParticipant = (call, userId) =>
  [toStringId(call.caller?._id || call.caller), toStringId(call.callee?._id || call.callee)].includes(
    toStringId(userId),
  );

const getCounterpartId = (call, userId) => {
  const callerId = toStringId(call.caller?._id || call.caller);
  const calleeId = toStringId(call.callee?._id || call.callee);
  return callerId === toStringId(userId) ? calleeId : callerId;
};

const getConversationParticipant = (conversation, memberUserId) =>
  conversation.participants?.find(
    (participant) => toStringId(participant.user?._id || participant.user) === toStringId(memberUserId),
  );

const mapGroupCallSession = (session) => ({
  _id: toStringId(session._id),
  conversationId: toStringId(session.conversation?._id || session.conversation),
  hostId: toStringId(session.host?._id || session.host),
  type: session.type,
  status: session.status,
  participants: (session.participants || []).map((entry) => {
    const participantUser = entry.user || {};
    const participantId = toStringId(participantUser._id || participantUser);
    return {
      user: {
        _id: participantId,
        username: participantUser.username || '',
        displayName: participantUser.displayName || '',
        avatar: participantUser.avatar || '',
      },
      joinedAt: entry.joinedAt,
    };
  }),
  startedAt: session.createdAt,
  endedAt: session.endedAt,
});

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

const enqueuePush = (payload) => {
  void queuePushNotification(payload).catch((error) => {
    logger.warn('failed to enqueue push notification', { error });
  });
};

export const registerChatHandlers = ({ io, socket }) => {
  const userId = socket.user.id;

  socket.on('conversation:join', async (payload, ack) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid conversation join payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const room = `conversation:${parsed.data.conversationId}`;
      await socket.join(room);
      const receipt = await markConversationRead({
        conversationId: parsed.data.conversationId,
        userId,
      });

      io.to(room).emit('message:read-update', {
        conversationId: parsed.data.conversationId,
        ...receipt,
      });
      ack?.({ ok: true, room });
    } catch {
      ack?.({ ok: false, error: 'Not authorized for this conversation' });
    }
  });

  socket.on('conversation:join-all', async (payload, ack) => {
    const parsed = joinAllSchema.safeParse(payload || {});
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid join-all payload' });
      return;
    }

    try {
      let cursor = parsed.data.cursor || null;
      let joinedCount = 0;
      const batchSize = parsed.data.limit || env.SOCKET_JOIN_ALL_BATCH_SIZE;

      while (true) {
        const page = await listUserConversationRoomIds({
          userId,
          limit: batchSize,
          cursor,
        });

        if (page.items.length === 0) {
          ack?.({ ok: true, count: joinedCount, complete: true, nextCursor: null });
          return;
        }

        await socket.join(page.items.map((conversationId) => `conversation:${conversationId}`));
        joinedCount += page.items.length;

        if (!page.nextCursor) {
          ack?.({ ok: true, count: joinedCount, complete: true, nextCursor: null });
          return;
        }

        cursor = page.nextCursor;
        await yieldToEventLoop();
      }
    } catch {
      ack?.({ ok: false, error: 'Failed to join conversations' });
    }
  });

  socket.on('message:send', async (payload, ack) => {
    const parsed = messageSendSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid message payload' });
      return;
    }

    try {
      const conversation = await ensureConversationMember(parsed.data.conversationId, userId);
      await assertNotBlockedInConversation({ conversation, senderId: userId });

      const message = await createMessage({
        conversationId: parsed.data.conversationId,
        senderId: userId,
        clientMessageId: parsed.data.clientMessageId || parsed.data.clientId || '',
        type: parsed.data.type,
        text: parsed.data.text,
        replyTo: parsed.data.replyTo,
      });

      const room = `conversation:${parsed.data.conversationId}`;
      io.to(room).emit('message:new', message);
      await bumpConversationListVersions({
        userIds: participantIds(conversation),
      });

      enqueuePush({
        userIds: recipientIds(conversation, userId),
        title: socket.user.displayName || socket.user.username,
        body:
          message.type === 'text'
            ? message.content?.text || 'New message'
            : `${socket.user.displayName || socket.user.username} sent ${message.type}`,
        url: '/chat',
        conversationId: parsed.data.conversationId,
        senderName: socket.user.displayName || socket.user.username,
      });

      ack?.({
        ok: true,
        data: {
          message,
          clientMessageId: parsed.data.clientMessageId || parsed.data.clientId || '',
        },
        message,
        clientId: parsed.data.clientId,
      });
    } catch (error) {
      ack?.({
        ok: false,
        errorCode: error?.code || 'MESSAGE_SEND_FAILED',
        error: error?.message || 'Failed to send message',
      });
    }
  });

  socket.on('typing:start', async (payload) => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const room = `conversation:${parsed.data.conversationId}`;
      socket.to(room).emit('typing:update', {
        conversationId: parsed.data.conversationId,
        userId,
        username: socket.user.username,
        isTyping: true,
      });
    } catch {
      // no-op
    }
  });

  socket.on('typing:stop', async (payload) => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const room = `conversation:${parsed.data.conversationId}`;
      socket.to(room).emit('typing:update', {
        conversationId: parsed.data.conversationId,
        userId,
        username: socket.user.username,
        isTyping: false,
      });
    } catch {
      // no-op
    }
  });

  socket.on('message:edit', async (payload, ack) => {
    const parsed = editSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid edit payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const message = await editMessage({
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
        userId,
        text: parsed.data.text,
      });

      io.to(`conversation:${parsed.data.conversationId}`).emit('message:update', message);
      ack?.({ ok: true, message });
    } catch {
      ack?.({ ok: false, error: 'Unable to edit message' });
    }
  });

  socket.on('message:delete', async (payload, ack) => {
    const parsed = deleteSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid delete payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const message = await deleteMessage({
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
        userId,
        scope: parsed.data.scope,
      });

      if (parsed.data.scope === 'everyone') {
        io.to(`conversation:${parsed.data.conversationId}`).emit('message:update', message);
      } else {
        io.to(`user:${userId}`).emit('message:remove-self', {
          conversationId: parsed.data.conversationId,
          messageId: parsed.data.messageId,
        });
      }

      ack?.({ ok: true, message });
    } catch {
      ack?.({ ok: false, error: 'Unable to delete message' });
    }
  });

  socket.on('message:react', async (payload, ack) => {
    const parsed = reactionSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid reaction payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const message = await toggleReaction({
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
        userId,
        emoji: parsed.data.emoji,
      });

      io.to(`conversation:${parsed.data.conversationId}`).emit('message:update', message);
      ack?.({ ok: true, message });
    } catch {
      ack?.({ ok: false, error: 'Unable to update reaction' });
    }
  });

  socket.on('message:star', async (payload, ack) => {
    const parsed = starSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid star payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const message = await toggleMessageStar({
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
        userId,
      });

      io.to(`conversation:${parsed.data.conversationId}`).emit('message:update', message);
      ack?.({ ok: true, message });
    } catch (error) {
      ack?.({ ok: false, error: error?.message || 'Unable to update star' });
    }
  });

  socket.on('message:pin', async (payload, ack) => {
    const parsed = pinSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid pin payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const result = await toggleMessagePin({
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
        userId,
      });

      io.to(`conversation:${parsed.data.conversationId}`).emit('message:update', result.message);
      io.to(`conversation:${parsed.data.conversationId}`).emit('conversation:pins-update', {
        conversationId: parsed.data.conversationId,
        pinnedMessageIds: result.pinnedMessageIds,
      });
      ack?.({ ok: true, message: result.message, pinnedMessageIds: result.pinnedMessageIds });
    } catch (error) {
      ack?.({ ok: false, error: error?.message || 'Unable to update pin' });
    }
  });

  socket.on('message:forward', async (payload, ack) => {
    const parsed = forwardSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid forward payload' });
      return;
    }

    try {
      const sourceConversation = await ensureConversationMember(parsed.data.sourceConversationId, userId);
      const targetConversation = await ensureConversationMember(parsed.data.targetConversationId, userId);
      await assertNotBlockedInConversation({ conversation: targetConversation, senderId: userId });

      const message = await forwardMessage({
        sourceConversationId: sourceConversation.id,
        sourceMessageId: parsed.data.messageId,
        targetConversationId: targetConversation.id,
        senderId: userId,
      });

      io.to(`conversation:${targetConversation.id}`).emit('message:new', message);
      await bumpConversationListVersions({
        userIds: participantIds(targetConversation),
      });

      enqueuePush({
        userIds: recipientIds(targetConversation, userId),
        title: socket.user.displayName || socket.user.username,
        body:
          message.type === 'text'
            ? message.content?.text || 'Forwarded message'
            : `${socket.user.displayName || socket.user.username} forwarded ${message.type}`,
        url: '/chat',
        conversationId: targetConversation.id,
        senderName: socket.user.displayName || socket.user.username,
      });

      ack?.({ ok: true, message, targetConversationId: targetConversation.id });
    } catch (error) {
      ack?.({ ok: false, error: error?.message || 'Unable to forward message' });
    }
  });

  socket.on('message:delivered', async (payload, ack) => {
    const parsed = deliveredSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid delivered payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const message = await markMessageDelivered({
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
        userId,
      });

      if (message) {
        io.to(`conversation:${parsed.data.conversationId}`).emit('message:update', message);
      }
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'Unable to update delivery status' });
    }
  });

  socket.on('message:read', async (payload, ack) => {
    const parsed = readSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid read payload' });
      return;
    }

    try {
      await ensureConversationMember(parsed.data.conversationId, userId);
      const receipt = await markConversationRead({
        conversationId: parsed.data.conversationId,
        userId,
      });

      io.to(`conversation:${parsed.data.conversationId}`).emit('message:read-update', {
        conversationId: parsed.data.conversationId,
        ...receipt,
      });
      await bumpConversationListVersions({
        userIds: [userId],
      });
      ack?.({ ok: true, receipt });
    } catch {
      ack?.({ ok: false, error: 'Unable to update read status' });
    }
  });

  socket.on('call:initiate', async (payload, ack) => {
    const parsed = callInitiateSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid call payload' });
      return;
    }

    try {
      const conversation = await ensureConversationMember(parsed.data.conversationId, userId);
      await assertNotBlockedInConversation({ conversation, senderId: userId });

      if (conversation.type !== 'private' || conversation.participants.length !== 2) {
        ack?.({ ok: false, error: 'Calls are currently supported only for private chats' });
        return;
      }

      const calleeId = conversation.participants
        .map((participant) => toStringId(participant.user))
        .find((id) => id !== toStringId(userId));

      if (!calleeId) {
        ack?.({ ok: false, error: 'Unable to determine call recipient' });
        return;
      }

      const call = await createCallLog({
        conversationId: parsed.data.conversationId,
        callerId: userId,
        calleeId,
        type: parsed.data.type,
      });

      await scheduleCallRingTimeout({
        callId: call.id,
        callerId: userId,
        calleeId,
        conversationId: parsed.data.conversationId,
        delayMs: env.CALL_RING_TIMEOUT_SECONDS * 1000,
      });

      io.to(`user:${calleeId}`).emit('call:incoming', {
        callId: call.id,
        conversationId: parsed.data.conversationId,
        type: parsed.data.type,
        from: {
          id: socket.user.id,
          username: socket.user.username,
          displayName: socket.user.displayName,
          avatar: socket.user.avatar,
        },
      });

      ack?.({ ok: true, callId: call.id, calleeId });
    } catch {
      ack?.({ ok: false, error: 'Failed to initiate call' });
    }
  });

  socket.on('call:accept', async (payload, ack) => {
    const parsed = callDecisionSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid call accept payload' });
      return;
    }

    try {
      const existingCall = await getCallLogById({ callId: parsed.data.callId });
      if (!isCallParticipant(existingCall, userId)) {
        ack?.({ ok: false, error: 'Not authorized for this call' });
        return;
      }
      if (existingCall.status !== 'ringing') {
        ack?.({ ok: false, error: 'Call is no longer available to accept' });
        return;
      }

      await cancelCallRingTimeout(parsed.data.callId);

      const call = await acceptCallLog({ callId: parsed.data.callId });
      const counterpartId = getCounterpartId(call, userId);

      io.to(`user:${counterpartId}`).emit('call:accepted', {
        callId: parsed.data.callId,
        byUserId: userId,
      });
      ack?.({ ok: true, call });
    } catch {
      ack?.({ ok: false, error: 'Failed to accept call' });
    }
  });

  socket.on('call:decline', async (payload, ack) => {
    const parsed = callDecisionSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid call decline payload' });
      return;
    }

    try {
      const existingCall = await getCallLogById({ callId: parsed.data.callId });
      if (!isCallParticipant(existingCall, userId)) {
        ack?.({ ok: false, error: 'Not authorized for this call' });
        return;
      }
      if (existingCall.status !== 'ringing') {
        ack?.({ ok: true, call: existingCall });
        return;
      }

      await cancelCallRingTimeout(parsed.data.callId);

      const call = await declineCallLog({ callId: parsed.data.callId });
      const counterpartId = getCounterpartId(call, userId);

      io.to(`user:${counterpartId}`).emit('call:declined', {
        callId: parsed.data.callId,
        byUserId: userId,
      });
      ack?.({ ok: true, call });
    } catch {
      ack?.({ ok: false, error: 'Failed to decline call' });
    }
  });

  socket.on('call:signal', async (payload, ack) => {
    const parsed = callSignalSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid signal payload' });
      return;
    }

    try {
      const call = await getCallLogById({ callId: parsed.data.callId });
      if (!isCallParticipant(call, userId)) {
        ack?.({ ok: false, error: 'Not authorized for this call' });
        return;
      }
      if (!['ringing', 'ongoing'].includes(call.status)) {
        ack?.({ ok: false, error: 'Call is no longer active' });
        return;
      }

      const counterpartId = getCounterpartId(call, userId);
      if (toStringId(parsed.data.toUserId) !== counterpartId) {
        ack?.({ ok: false, error: 'Signal recipient mismatch' });
        return;
      }

      io.to(`user:${counterpartId}`).emit('call:signal', {
        callId: parsed.data.callId,
        fromUserId: userId,
        signal: parsed.data.signal,
      });
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'Failed to relay call signal' });
    }
  });

  socket.on('call:end', async (payload, ack) => {
    const parsed = callEndSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid end call payload' });
      return;
    }

    try {
      const existingCall = await getCallLogById({ callId: parsed.data.callId });
      if (!isCallParticipant(existingCall, userId)) {
        ack?.({ ok: false, error: 'Not authorized for this call' });
        return;
      }
      if (!['ringing', 'ongoing'].includes(existingCall.status)) {
        ack?.({ ok: true, call: existingCall });
        return;
      }

      await cancelCallRingTimeout(parsed.data.callId);

      const call = await endCallLog({
        callId: parsed.data.callId,
        duration: parsed.data.duration || 0,
      });
      const counterpartId = getCounterpartId(call, userId);

      io.to(`user:${counterpartId}`).emit('call:ended', {
        callId: parsed.data.callId,
        byUserId: userId,
      });
      ack?.({ ok: true, call });
    } catch {
      ack?.({ ok: false, error: 'Failed to end call' });
    }
  });

  socket.on('group-call:start', async (payload, ack) => {
    const parsed = groupCallStartSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call payload' });
      return;
    }

    try {
      const conversation = await ensureConversationMember(parsed.data.conversationId, userId);
      if (conversation.type !== 'group') {
        ack?.({ ok: false, error: 'Group calls are supported only in group conversations' });
        return;
      }

      const session = await createOrGetGroupCallSession({
        conversationId: parsed.data.conversationId,
        hostId: userId,
        type: parsed.data.type,
      });
      const mapped = mapGroupCallSession(session);

      io.to(`conversation:${parsed.data.conversationId}`).emit('group-call:started', mapped);
      ack?.({ ok: true, session: mapped });
    } catch {
      ack?.({ ok: false, error: 'Failed to start group call' });
    }
  });

  socket.on('group-call:join', async (payload, ack) => {
    const parsed = groupCallSessionSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call join payload' });
      return;
    }

    try {
      const existing = await getGroupCallSessionById({ sessionId: parsed.data.sessionId });
      if (!existing || existing.status !== 'active') {
        ack?.({ ok: false, error: 'Group call is not active' });
        return;
      }

      const conversationId = toStringId(existing.conversation?._id || existing.conversation);
      await ensureConversationMember(conversationId, userId);

      const session = await joinGroupCallSession({
        sessionId: parsed.data.sessionId,
        userId,
      });
      const mapped = mapGroupCallSession(session);

      io.to(`conversation:${conversationId}`).emit('group-call:participant-joined', {
        sessionId: mapped._id,
        conversationId: mapped.conversationId,
        userId,
        participants: mapped.participants,
      });
      ack?.({
        ok: true,
        session: mapped,
        peerIds: listGroupCallParticipantIds({ session }).filter((id) => id !== toStringId(userId)),
      });
    } catch {
      ack?.({ ok: false, error: 'Failed to join group call' });
    }
  });

  socket.on('group-call:leave', async (payload, ack) => {
    const parsed = groupCallSessionSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call leave payload' });
      return;
    }

    try {
      const existing = await getGroupCallSessionById({ sessionId: parsed.data.sessionId });
      if (!existing) {
        ack?.({ ok: false, error: 'Group call not found' });
        return;
      }

      const conversationId = toStringId(existing.conversation?._id || existing.conversation);
      await ensureConversationMember(conversationId, userId);

      const session = await leaveGroupCallSession({
        sessionId: parsed.data.sessionId,
        userId,
      });
      const mapped = mapGroupCallSession(session);

      io.to(`conversation:${conversationId}`).emit('group-call:participant-left', {
        sessionId: mapped._id,
        conversationId: mapped.conversationId,
        userId,
        participants: mapped.participants,
      });

      if (mapped.status === 'ended') {
        io.to(`conversation:${conversationId}`).emit('group-call:ended', {
          sessionId: mapped._id,
          conversationId: mapped.conversationId,
        });
      }

      ack?.({ ok: true, session: mapped });
    } catch {
      ack?.({ ok: false, error: 'Failed to leave group call' });
    }
  });

  socket.on('group-call:end', async (payload, ack) => {
    const parsed = groupCallSessionSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call end payload' });
      return;
    }

    try {
      const existing = await getGroupCallSessionById({ sessionId: parsed.data.sessionId });
      if (!existing) {
        ack?.({ ok: false, error: 'Group call not found' });
        return;
      }

      const conversationId = toStringId(existing.conversation?._id || existing.conversation);
      const conversation = await ensureConversationMember(conversationId, userId);
      const participant = conversation.participants?.find(
        (entry) => toStringId(entry.user?._id || entry.user) === toStringId(userId),
      );
      const canEndGroupCall =
        toStringId(existing.host?._id || existing.host) === toStringId(userId) ||
        ['owner', 'admin'].includes(participant?.role || '');

      if (!canEndGroupCall) {
        ack?.({ ok: false, error: 'Only host/admin can end this group call' });
        return;
      }

      const session = await endGroupCallSession({
        sessionId: parsed.data.sessionId,
      });
      const mapped = mapGroupCallSession(session);

      io.to(`conversation:${conversationId}`).emit('group-call:ended', {
        sessionId: mapped._id,
        conversationId: mapped.conversationId,
      });
      ack?.({ ok: true, session: mapped });
    } catch {
      ack?.({ ok: false, error: 'Failed to end group call' });
    }
  });

  socket.on('group-call:signal', async (payload, ack) => {
    const parsed = groupCallSignalSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call signal payload' });
      return;
    }

    try {
      const session = await getGroupCallSessionById({ sessionId: parsed.data.sessionId });
      if (!session || session.status !== 'active') {
        ack?.({ ok: false, error: 'Group call is no longer active' });
        return;
      }
      if (!isGroupCallParticipant({ session, userId })) {
        ack?.({ ok: false, error: 'Not a participant of this group call' });
        return;
      }

      const participantIds = listGroupCallParticipantIds({ session });
      const toUserId = toStringId(parsed.data.toUserId);
      if (!participantIds.includes(toUserId)) {
        ack?.({ ok: false, error: 'Signal recipient is not in this group call' });
        return;
      }

      io.to(`user:${toUserId}`).emit('group-call:signal', {
        sessionId: parsed.data.sessionId,
        fromUserId: userId,
        signal: parsed.data.signal,
      });

      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'Failed to relay group call signal' });
    }
  });

  socket.on('group-call:media-state', async (payload, ack) => {
    const parsed = groupCallMediaStateSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call media state payload' });
      return;
    }

    try {
      const session = await getGroupCallSessionById({ sessionId: parsed.data.sessionId });
      if (!session || session.status !== 'active') {
        ack?.({ ok: false, error: 'Group call is no longer active' });
        return;
      }
      if (!isGroupCallParticipant({ session, userId })) {
        ack?.({ ok: false, error: 'Not a participant of this group call' });
        return;
      }

      const conversationId = toStringId(session.conversation?._id || session.conversation);
      const nextState = {
        sessionId: parsed.data.sessionId,
        conversationId,
        userId,
        updatedAt: new Date().toISOString(),
      };

      if (typeof parsed.data.audioEnabled === 'boolean') {
        nextState.audioEnabled = parsed.data.audioEnabled;
      }

      if (typeof parsed.data.videoEnabled === 'boolean') {
        nextState.videoEnabled = parsed.data.videoEnabled;
      }

      io.to(`conversation:${conversationId}`).emit('group-call:media-state', nextState);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'Failed to update group call media state' });
    }
  });

  socket.on('group-call:mute-user', async (payload, ack) => {
    const parsed = groupCallMuteUserSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid group call mute payload' });
      return;
    }

    try {
      const session = await getGroupCallSessionById({ sessionId: parsed.data.sessionId });
      if (!session || session.status !== 'active') {
        ack?.({ ok: false, error: 'Group call is no longer active' });
        return;
      }
      if (!isGroupCallParticipant({ session, userId })) {
        ack?.({ ok: false, error: 'Not a participant of this group call' });
        return;
      }

      const targetUserId = toStringId(parsed.data.targetUserId);
      if (targetUserId === toStringId(userId)) {
        ack?.({ ok: false, error: 'Cannot mute yourself with this action' });
        return;
      }

      if (!isGroupCallParticipant({ session, userId: targetUserId })) {
        ack?.({ ok: false, error: 'Target user is not in this group call' });
        return;
      }

      const conversationId = toStringId(session.conversation?._id || session.conversation);
      const conversation = await ensureConversationMember(conversationId, userId);
      const requester = getConversationParticipant(conversation, userId);
      const canRequestMute =
        toStringId(session.host?._id || session.host) === toStringId(userId) ||
        ['owner', 'admin'].includes(requester?.role || '');

      if (!canRequestMute) {
        ack?.({ ok: false, error: 'Only host/admin can request a mute' });
        return;
      }

      io.to(`user:${targetUserId}`).emit('group-call:mute-requested', {
        sessionId: parsed.data.sessionId,
        conversationId,
        targetUserId,
        byUserId: userId,
        muteAudio: parsed.data.muteAudio !== false,
      });

      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'Failed to request group call mute' });
    }
  });
};
