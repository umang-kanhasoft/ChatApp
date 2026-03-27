import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { StatusCodes } from 'http-status-codes';
import { ScheduledMessage } from '../models/ScheduledMessage.js';
import { ApiError } from '../utils/ApiError.js';

const sanitizeText = (text) =>
  sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();

const toStringId = (value) => String(value);

const recurrenceFrequencies = new Set(['none', 'daily', 'weekly']);

const normalizeRecurrence = (value) => {
  const next = value || {};
  const frequency = String(next.frequency || 'none');
  const interval = Number(next.interval || 1);

  if (!recurrenceFrequencies.has(frequency)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid recurrence frequency');
  }

  if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Recurrence interval must be between 1 and 30');
  }

  if (frequency === 'none') {
    return { frequency: 'none', interval: 1 };
  }

  return { frequency, interval };
};

const getNextRunAtFromRecurrence = ({ runAt, recurrence }) => {
  const base = new Date(runAt);
  if (Number.isNaN(base.getTime())) return null;

  const next = new Date(base);
  if (recurrence.frequency === 'daily') {
    next.setUTCDate(next.getUTCDate() + recurrence.interval);
    return next;
  }

  if (recurrence.frequency === 'weekly') {
    next.setUTCDate(next.getUTCDate() + recurrence.interval * 7);
    return next;
  }

  return null;
};

const populateScheduledMessage = (query) =>
  query
    .populate('sender', 'username displayName avatar')
    .populate('payload.replyTo', 'content type sender')
    .populate({
      path: 'sentMessage',
      select: 'type content sender createdAt',
      populate: { path: 'sender', select: 'username displayName avatar' },
    });

export const createScheduledMessage = async ({
  conversationId,
  senderId,
  clientMessageId,
  text,
  replyTo,
  runAt,
  recurrence,
}) => {
  const trimmedText = sanitizeText(text || '');
  if (!trimmedText) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Message text is required');
  }

  const runDate = new Date(runAt);
  if (Number.isNaN(runDate.getTime())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid schedule time');
  }

  if (runDate.getTime() <= Date.now() + 5000) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Schedule time must be at least 5 seconds in the future');
  }

  const normalizedRecurrence = normalizeRecurrence(recurrence);

  const existing = await ScheduledMessage.findOne({
    conversation: conversationId,
    sender: senderId,
    clientMessageId,
  });
  if (existing) {
    return populateScheduledMessage(ScheduledMessage.findById(existing.id));
  }

  let scheduled;
  try {
    scheduled = await ScheduledMessage.create({
      conversation: conversationId,
      sender: senderId,
      clientMessageId,
      payload: {
        text: trimmedText,
        replyTo: replyTo || null,
      },
      runAt: runDate,
      status: 'pending',
      recurrence: normalizedRecurrence,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await ScheduledMessage.findOne({
        conversation: conversationId,
        sender: senderId,
        clientMessageId,
      });

      if (duplicate) {
        return populateScheduledMessage(ScheduledMessage.findById(duplicate.id));
      }
    }

    throw error;
  }

  return populateScheduledMessage(ScheduledMessage.findById(scheduled.id));
};

export const listScheduledMessagesForUser = async ({
  conversationId,
  userId,
  limit = 50,
  statuses = ['pending', 'processing'],
}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const items = await populateScheduledMessage(
    ScheduledMessage.find({
      conversation: conversationId,
      sender: userId,
      status: { $in: statuses },
    })
      .sort({ runAt: 1, _id: 1 })
      .limit(safeLimit),
  );
  return items;
};

export const createRecurringScheduledMessage = async ({ source }) => {
  const recurrence = normalizeRecurrence(source?.recurrence);
  if (recurrence.frequency === 'none') return null;

  const nextRunAt = getNextRunAtFromRecurrence({
    runAt: source?.runAt,
    recurrence,
  });
  if (!nextRunAt) return null;

  const scheduled = await ScheduledMessage.create({
    conversation: source.conversation?._id || source.conversation,
    sender: source.sender?._id || source.sender,
    clientMessageId: crypto.randomUUID(),
    payload: {
      text: source.payload?.text || '',
      replyTo: source.payload?.replyTo?._id || source.payload?.replyTo || null,
    },
    runAt: nextRunAt,
    status: 'pending',
    recurrence,
  });

  return populateScheduledMessage(ScheduledMessage.findById(scheduled.id));
};

export const cancelScheduledMessage = async ({ scheduledMessageId, conversationId, userId }) => {
  const scheduled = await ScheduledMessage.findOne({
    _id: scheduledMessageId,
    conversation: conversationId,
    sender: userId,
  });

  if (!scheduled) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Scheduled message not found');
  }

  if (!['pending', 'processing'].includes(scheduled.status)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Scheduled message cannot be canceled');
  }

  scheduled.status = 'canceled';
  scheduled.canceledAt = new Date();
  scheduled.lastError = '';
  await scheduled.save();

  return populateScheduledMessage(ScheduledMessage.findById(scheduled.id));
};

export const claimDueScheduledMessage = async ({ now = new Date() } = {}) =>
  ScheduledMessage.findOneAndUpdate(
    {
      status: 'pending',
      runAt: { $lte: now },
    },
    {
      $set: {
        status: 'processing',
        lockedAt: now,
      },
      $inc: {
        attempts: 1,
      },
    },
    {
      sort: { runAt: 1, _id: 1 },
      new: true,
    },
  );

export const markScheduledMessageSent = async ({ scheduledMessageId, sentMessageId }) =>
  ScheduledMessage.findByIdAndUpdate(
    scheduledMessageId,
    {
      $set: {
        status: 'sent',
        processedAt: new Date(),
        sentMessage: sentMessageId,
        lastError: '',
      },
      $unset: {
        lockedAt: 1,
      },
    },
    { new: true },
  );

export const markScheduledMessageCanceled = async ({ scheduledMessageId, reason }) =>
  ScheduledMessage.findByIdAndUpdate(
    scheduledMessageId,
    {
      $set: {
        status: 'canceled',
        canceledAt: new Date(),
        lastError: reason || '',
      },
      $unset: {
        lockedAt: 1,
      },
    },
    { new: true },
  );

export const retryOrFailScheduledMessage = async ({
  scheduledMessageId,
  attempts,
  maxRetries,
  reason,
  nextDelayMs = 30000,
}) => {
  const nextAttempt = Number(attempts) || 1;
  const cappedReason = String(reason || 'Failed to process scheduled message').slice(0, 500);

  if (nextAttempt >= maxRetries) {
    return ScheduledMessage.findByIdAndUpdate(
      scheduledMessageId,
      {
        $set: {
          status: 'failed',
          processedAt: new Date(),
          lastError: cappedReason,
        },
        $unset: {
          lockedAt: 1,
        },
      },
      { new: true },
    );
  }

  return ScheduledMessage.findByIdAndUpdate(
    scheduledMessageId,
    {
      $set: {
        status: 'pending',
        runAt: new Date(Date.now() + nextDelayMs),
        lastError: cappedReason,
      },
      $unset: {
        lockedAt: 1,
      },
    },
    { new: true },
  );
};

export const releaseStaleScheduledMessages = async ({ staleMs = 5 * 60 * 1000 } = {}) =>
  ScheduledMessage.updateMany(
    {
      status: 'processing',
      lockedAt: { $lte: new Date(Date.now() - staleMs) },
    },
    {
      $set: {
        status: 'pending',
      },
      $unset: {
        lockedAt: 1,
      },
    },
  );

export const mapScheduledMessage = (item) => {
  const source = item?.toObject ? item.toObject() : item;
  return {
    _id: toStringId(source?._id),
    conversationId: toStringId(source?.conversation?._id || source?.conversation),
    sender: source?.sender
      ? {
          _id: toStringId(source.sender._id || source.sender),
          username: source.sender.username || '',
          displayName: source.sender.displayName || '',
          avatar: source.sender.avatar || '',
        }
      : null,
    payload: {
      text: source?.payload?.text || '',
      replyTo: source?.payload?.replyTo || null,
    },
    recurrence: normalizeRecurrence(source?.recurrence),
    runAt: source?.runAt || null,
    status: source?.status || 'pending',
    attempts: source?.attempts || 0,
    lastError: source?.lastError || '',
    sentMessage: source?.sentMessage || null,
    createdAt: source?.createdAt || null,
    updatedAt: source?.updatedAt || null,
  };
};
