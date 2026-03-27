import { env } from '../config/env.js';
import { Conversation } from '../models/Conversation.js';
import { bumpConversationListVersions } from '../services/conversationCacheService.js';
import { createMessage } from '../services/messageService.js';
import { queuePushNotification } from '../queues/runtime.js';
import {
  claimDueScheduledMessage,
  createRecurringScheduledMessage,
  markScheduledMessageCanceled,
  markScheduledMessageSent,
  releaseStaleScheduledMessages,
  retryOrFailScheduledMessage,
} from '../services/scheduledMessageService.js';
import { assertNotBlockedInConversation } from '../services/conversationService.js';
import {
  emitScheduledMessageCreated,
  emitScheduledMessageCanceled,
  emitScheduledMessageFailed,
  emitScheduledMessageSent,
} from '../socket/events/scheduledMessageEvents.js';
import { instanceId } from '../utils/instance.js';
import { logger } from '../utils/logger.js';

const toStringId = (value) => String(value);

const conversationParticipantIds = (conversation) =>
  (conversation?.participants || []).map((entry) => toStringId(entry.user?._id || entry.user));

const recipientIds = (conversation, senderId) =>
  conversationParticipantIds(conversation).filter((id) => id !== toStringId(senderId));

const buildRetryDelayMs = (attempts) => {
  const baseMs = 30000;
  return Math.min(baseMs * Math.max(1, attempts), 5 * 60 * 1000);
};

const leaderKey = 'scheduler:scheduled-messages:leader';

const processClaimedScheduledMessage = async ({ job, io }) => {
  const conversation = await Conversation.findById(job.conversation);
  if (!conversation) {
    const canceled = await markScheduledMessageCanceled({
      scheduledMessageId: job._id,
      reason: 'Conversation no longer exists',
    });
    emitScheduledMessageCanceled({ io, scheduledMessage: canceled });
    return;
  }

  const senderId = toStringId(job.sender);
  const memberIds = conversationParticipantIds(conversation);
  if (!memberIds.includes(senderId)) {
    const canceled = await markScheduledMessageCanceled({
      scheduledMessageId: job._id,
      reason: 'Sender is no longer part of this conversation',
    });
    emitScheduledMessageCanceled({ io, scheduledMessage: canceled });
    return;
  }

  try {
    await assertNotBlockedInConversation({ conversation, senderId });
  } catch (error) {
    const canceled = await markScheduledMessageCanceled({
      scheduledMessageId: job._id,
      reason: error?.message || 'Blocked by privacy settings',
    });
    emitScheduledMessageCanceled({ io, scheduledMessage: canceled });
    return;
  }

  const message = await createMessage({
    conversationId: toStringId(job.conversation),
    senderId,
    type: 'text',
    text: job.payload?.text || '',
    replyTo: job.payload?.replyTo || null,
  });

  const sent = await markScheduledMessageSent({
    scheduledMessageId: job._id,
    sentMessageId: message._id,
  });
  emitScheduledMessageSent({ io, scheduledMessage: sent });

  const nextRecurring = await createRecurringScheduledMessage({ source: job });
  if (nextRecurring) {
    emitScheduledMessageCreated({ io, scheduledMessage: nextRecurring });
  }

  io?.to(`conversation:${toStringId(job.conversation)}`).emit('message:new', message);
  await bumpConversationListVersions({
    userIds: memberIds,
  });

  const senderLabel = message.sender?.displayName || message.sender?.username || 'Someone';
  await queuePushNotification({
    userIds: recipientIds(conversation, senderId),
    title: senderLabel,
    body: message.content?.text || 'New message',
    url: '/chat',
    conversationId: toStringId(job.conversation),
    senderName: senderLabel,
  });
};

export const startScheduledMessageScheduler = ({ io, redisClient = null } = {}) => {
  const intervalMs = env.SCHEDULED_MESSAGE_POLL_INTERVAL_MS;
  const maxBatch = env.SCHEDULED_MESSAGE_MAX_BATCH_SIZE;
  const maxRetries = env.SCHEDULED_MESSAGE_MAX_RETRIES;
  const leaderId = `${instanceId}:${process.pid}`;

  let isRunning = false;

  const acquireLeadership = async () => {
    if (!redisClient) {
      return true;
    }

    const currentLeader = await redisClient.get(leaderKey);
    if (currentLeader === leaderId) {
      await redisClient.pexpire(leaderKey, env.SCHEDULED_MESSAGE_LEADER_TTL_MS);
      return true;
    }

    const acquired = await redisClient.set(
      leaderKey,
      leaderId,
      'PX',
      env.SCHEDULED_MESSAGE_LEADER_TTL_MS,
      'NX',
    );
    return acquired === 'OK';
  };

  const releaseLeadership = async () => {
    if (!redisClient) {
      return;
    }

    const currentLeader = await redisClient.get(leaderKey);
    if (currentLeader === leaderId) {
      await redisClient.del(leaderKey);
    }
  };

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const isLeader = await acquireLeadership();
      if (!isLeader) {
        return;
      }

      await releaseStaleScheduledMessages();

      for (let processed = 0; processed < maxBatch; processed += 1) {
        const job = await claimDueScheduledMessage();
        if (!job) break;

        try {
          await processClaimedScheduledMessage({ job, io });
        } catch (error) {
          const nextState = await retryOrFailScheduledMessage({
            scheduledMessageId: job._id,
            attempts: job.attempts,
            maxRetries,
            reason: error?.message || 'Failed to process scheduled message',
            nextDelayMs: buildRetryDelayMs(job.attempts),
          });

          if (nextState?.status === 'failed') {
            emitScheduledMessageFailed({ io, scheduledMessage: nextState });
          }
        }
      }
    } catch (error) {
      logger.error('scheduled message scheduler tick failed', { error });
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  void tick();

  return () => {
    clearInterval(timer);
    void releaseLeadership();
  };
};
