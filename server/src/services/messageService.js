import sanitizeHtml from 'sanitize-html';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { ApiError } from '../utils/ApiError.js';
import { decodeCursor, encodeCursor } from '../utils/pagination.js';

const sanitizeText = (text) =>
  sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();

const toObjectIdString = (value) => String(value);

const arrayWithoutId = (items, valueToRemove) =>
  (items || []).filter((entry) => toObjectIdString(entry) !== toObjectIdString(valueToRemove));

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 10;

const sanitizePollPayload = (poll) => {
  const question = sanitizeText(poll?.question || '');
  if (!question) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Poll question is required');
  }

  const rawOptions = Array.isArray(poll?.options) ? poll.options : [];
  const cleanedOptions = rawOptions
    .map((entry) => sanitizeText(typeof entry === 'string' ? entry : entry?.text || ''))
    .filter(Boolean);

  const uniqueOptions = [];
  const seen = new Set();
  for (const option of cleanedOptions) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueOptions.push(option);
  }

  if (uniqueOptions.length < MIN_POLL_OPTIONS) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Poll requires at least ${MIN_POLL_OPTIONS} options`,
    );
  }

  if (uniqueOptions.length > MAX_POLL_OPTIONS) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Poll supports up to ${MAX_POLL_OPTIONS} options`,
    );
  }

  const allowMultipleChoice = Boolean(poll?.allowMultipleChoice);

  let expiresAt = null;
  if (poll?.expiresAt) {
    const parsedExpiry = new Date(poll.expiresAt);
    if (Number.isNaN(parsedExpiry.getTime())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Poll expiry must be a valid date');
    }
    if (parsedExpiry.getTime() <= Date.now() + 60 * 1000) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Poll expiry must be at least 1 minute in the future',
      );
    }
    expiresAt = parsedExpiry;
  }

  return {
    question,
    allowMultipleChoice,
    expiresAt,
    options: uniqueOptions.map((text) => ({ text, votes: [] })),
  };
};

const sanitizeForViewer = (messageDoc, viewerId) => {
  const message = messageDoc.toObject ? messageDoc.toObject() : messageDoc;
  const viewerIdString = toObjectIdString(viewerId);

  const deletedForSet = new Set((message.deletedFor || []).map((entry) => toObjectIdString(entry)));
  if (deletedForSet.has(viewerIdString)) {
    return null;
  }

  if (message.deletedForEveryone) {
    return {
      ...message,
      content: {
        text: 'This message was deleted',
        mediaUrl: '',
        fileName: '',
        mimeType: '',
        fileSize: 0,
      },
      reactions: [],
    };
  }

  return message;
};

const populateMessage = (messageId) =>
  Message.findById(messageId)
    .populate('sender', 'username displayName avatar')
    .populate('content.poll.options.votes', 'username displayName avatar')
    .populate({
      path: 'replyTo',
      select: 'content type sender',
      populate: { path: 'sender', select: 'username displayName avatar' },
    });

export const listMessages = async ({ conversationId, userId, limit = 30, cursor }) => {
  const cursorDate = decodeCursor(cursor);

  const query = {
    conversation: conversationId,
  };

  if (cursorDate) {
    query.createdAt = { $lt: cursorDate };
  }

  const items = await Message.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('sender', 'username displayName avatar')
    .populate('content.poll.options.votes', 'username displayName avatar')
    .populate({
      path: 'replyTo',
      select: 'content type sender',
      populate: { path: 'sender', select: 'username displayName avatar' },
    });

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const ordered = pageItems.reverse();
  const visible = ordered.map((message) => sanitizeForViewer(message, userId)).filter(Boolean);
  const oldest = ordered[0];

  return {
    items: visible,
    nextCursor: hasMore && oldest ? encodeCursor(oldest.createdAt) : null,
  };
};

export const createMessage = async ({
  conversationId,
  senderId,
  clientMessageId = '',
  type,
  text,
  replyTo = null,
  media,
  poll,
}) => {
  if (clientMessageId) {
    const existing = await Message.findOne({
      conversation: conversationId,
      sender: senderId,
      clientMessageId,
    });

    if (existing) {
      return populateMessage(existing.id);
    }
  }

  const normalizedType = type || 'text';
  const trimmedText = sanitizeText(text || '');
  const hasMedia = Boolean(media?.url);
  const pollPayload = normalizedType === 'poll' ? sanitizePollPayload(poll) : null;

  if (normalizedType === 'text' && trimmedText.length === 0 && !hasMedia) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Message text is required');
  }

  if (!['text', 'poll'].includes(normalizedType) && !hasMedia && trimmedText.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Media or text payload is required');
  }

  let replyMessageId = null;
  if (replyTo) {
    const repliedMessage = await Message.findOne({
      _id: replyTo,
      conversation: conversationId,
    }).select('_id');

    if (!repliedMessage) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Reply target was not found');
    }

    replyMessageId = repliedMessage._id;
  }

  let message;
  try {
    message = await Message.create({
      conversation: conversationId,
      sender: senderId,
      clientMessageId,
      type: normalizedType,
      content: {
        text: normalizedType === 'poll' ? '' : trimmedText,
        mediaUrl: normalizedType === 'poll' ? '' : media?.url || '',
        fileName: normalizedType === 'poll' ? '' : media?.fileName || '',
        mimeType: normalizedType === 'poll' ? '' : media?.mimeType || '',
        fileSize: normalizedType === 'poll' ? 0 : media?.fileSize || 0,
        ...(pollPayload ? { poll: pollPayload } : {}),
      },
      replyTo: replyMessageId,
      deliveredTo: [{ user: senderId, at: new Date() }],
      readBy: [{ user: senderId, at: new Date() }],
      status: 'sent',
    });
  } catch (error) {
    if (error?.code === 11000 && clientMessageId) {
      const existing = await Message.findOne({
        conversation: conversationId,
        sender: senderId,
        clientMessageId,
      });

      if (existing) {
        return populateMessage(existing.id);
      }
    }

    throw error;
  }

  await Conversation.findByIdAndUpdate(conversationId, {
    $set: {
      lastMessage: message.id,
      lastActivityAt: new Date(),
    },
  });

  await Conversation.updateOne(
    { _id: conversationId },
    {
      $inc: {
        'participants.$[participant].unreadCount': 1,
      },
    },
    {
      arrayFilters: [
        {
          'participant.user': { $ne: new mongoose.Types.ObjectId(senderId) },
        },
      ],
    },
  );

  return populateMessage(message.id);
};

export const forwardMessage = async ({
  sourceConversationId,
  sourceMessageId,
  targetConversationId,
  senderId,
}) => {
  const sourceMessage = await Message.findOne({
    _id: sourceMessageId,
    conversation: sourceConversationId,
  });

  if (!sourceMessage) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Source message not found');
  }

  if (sourceMessage.deletedForEveryone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot forward a deleted message');
  }

  const isDeletedForSender = (sourceMessage.deletedFor || []).some(
    (entry) => toObjectIdString(entry) === toObjectIdString(senderId),
  );
  if (isDeletedForSender) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Source message not found');
  }

  if (sourceMessage.type === 'system') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'System messages cannot be forwarded');
  }

  const hasMedia = Boolean(sourceMessage.content?.mediaUrl);
  const media = hasMedia
    ? {
        url: sourceMessage.content.mediaUrl,
        fileName: sourceMessage.content.fileName || '',
        mimeType: sourceMessage.content.mimeType || '',
        fileSize: sourceMessage.content.fileSize || 0,
      }
    : undefined;

  const poll =
    sourceMessage.type === 'poll'
      ? {
          question: sourceMessage.content?.poll?.question || '',
          allowMultipleChoice: Boolean(sourceMessage.content?.poll?.allowMultipleChoice),
          expiresAt:
            sourceMessage.content?.poll?.expiresAt &&
            new Date(sourceMessage.content.poll.expiresAt).getTime() > Date.now()
              ? sourceMessage.content.poll.expiresAt
              : null,
          options: (sourceMessage.content?.poll?.options || []).map((entry) => entry.text || ''),
        }
      : undefined;

  const forwardedMessage = await createMessage({
    conversationId: targetConversationId,
    senderId,
    type: sourceMessage.type,
    text: sourceMessage.content?.text || '',
    media,
    poll,
  });

  await Message.findByIdAndUpdate(forwardedMessage.id, {
    $set: {
      isForwarded: true,
      forwardedFrom: sourceMessage._id,
    },
  });

  return populateMessage(forwardedMessage.id);
};

export const editMessage = async ({ conversationId, messageId, userId, text }) => {
  const message = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (toObjectIdString(message.sender) !== toObjectIdString(userId)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Only sender can edit this message');
  }

  if (message.deletedForEveryone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot edit a deleted message');
  }

  if (message.type === 'poll') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Poll messages cannot be edited');
  }

  const trimmed = sanitizeText(text);
  if (!trimmed) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Edited message cannot be empty');
  }

  message.content.text = trimmed;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  return populateMessage(message.id);
};

export const deleteMessage = async ({ conversationId, messageId, userId, scope }) => {
  const message = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (scope === 'everyone') {
    if (toObjectIdString(message.sender) !== toObjectIdString(userId)) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Only sender can delete for everyone');
    }

    message.deletedForEveryone = true;
    message.content.text = '';
    message.content.mediaUrl = '';
    message.content.fileName = '';
    message.content.mimeType = '';
    message.content.fileSize = 0;
    message.content.poll = {
      question: '',
      allowMultipleChoice: false,
      expiresAt: null,
      options: [],
    };
    message.reactions = [];
    message.starredBy = [];
    message.pinnedAt = null;
    await message.save();

    await Conversation.findByIdAndUpdate(conversationId, {
      $pull: {
        pinnedMessageIds: message._id,
      },
    });

    return populateMessage(message.id);
  }

  const deletedSet = new Set((message.deletedFor || []).map((entry) => toObjectIdString(entry)));
  deletedSet.add(toObjectIdString(userId));
  message.deletedFor = [...deletedSet];
  await message.save();

  return populateMessage(message.id);
};

export const toggleReaction = async ({ conversationId, messageId, userId, emoji }) => {
  const message = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (message.deletedForEveryone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot react to deleted message');
  }

  const userIdString = toObjectIdString(userId);
  const reactionIndex = message.reactions.findIndex((reaction) => reaction.emoji === emoji);

  if (reactionIndex === -1) {
    message.reactions.push({ emoji, users: [userId] });
    await message.save();
    return populateMessage(message.id);
  }

  const existingUsers = message.reactions[reactionIndex].users.map((entry) => toObjectIdString(entry));
  if (existingUsers.includes(userIdString)) {
    message.reactions[reactionIndex].users = message.reactions[reactionIndex].users.filter(
      (entry) => toObjectIdString(entry) !== userIdString,
    );
  } else {
    message.reactions[reactionIndex].users.push(userId);
  }

  if (message.reactions[reactionIndex].users.length === 0) {
    message.reactions.splice(reactionIndex, 1);
  }

  await message.save();
  return populateMessage(message.id);
};

export const toggleMessageStar = async ({ conversationId, messageId, userId }) => {
  const message = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (message.deletedForEveryone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot star a deleted message');
  }

  const isDeletedForUser = (message.deletedFor || []).some(
    (entry) => toObjectIdString(entry) === toObjectIdString(userId),
  );
  if (isDeletedForUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const userIdString = toObjectIdString(userId);
  const existingStarredBy = message.starredBy.map((entry) => toObjectIdString(entry));
  if (existingStarredBy.includes(userIdString)) {
    message.starredBy = arrayWithoutId(message.starredBy, userId);
  } else {
    message.starredBy.push(userId);
  }

  await message.save();
  return populateMessage(message.id);
};

export const toggleMessagePin = async ({ conversationId, messageId, userId, maxPinned = 3 }) => {
  const [message, conversation] = await Promise.all([
    Message.findOne({
      _id: messageId,
      conversation: conversationId,
    }),
    Conversation.findById(conversationId),
  ]);

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (!conversation) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  if (message.deletedForEveryone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot pin a deleted message');
  }

  const isDeletedForUser = (message.deletedFor || []).some(
    (entry) => toObjectIdString(entry) === toObjectIdString(userId),
  );
  if (isDeletedForUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const pinnedMessageIds = conversation.pinnedMessageIds || [];
  const alreadyPinned = pinnedMessageIds.some(
    (entry) => toObjectIdString(entry) === toObjectIdString(message._id),
  );

  if (alreadyPinned) {
    conversation.pinnedMessageIds = arrayWithoutId(pinnedMessageIds, message._id);
    message.pinnedAt = null;
    await Promise.all([conversation.save(), message.save()]);
    return {
      message: await populateMessage(message.id),
      pinnedMessageIds: conversation.pinnedMessageIds.map((entry) => toObjectIdString(entry)),
    };
  }

  if (pinnedMessageIds.length >= maxPinned) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `You can pin up to ${maxPinned} messages in a conversation`,
    );
  }

  conversation.pinnedMessageIds = [...pinnedMessageIds, message._id];
  message.pinnedAt = new Date();

  await Promise.all([conversation.save(), message.save()]);
  return {
    message: await populateMessage(message.id),
    pinnedMessageIds: conversation.pinnedMessageIds.map((entry) => toObjectIdString(entry)),
  };
};

export const votePollOption = async ({ conversationId, messageId, userId, optionIndex }) => {
  const message = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (message.type !== 'poll') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Message is not a poll');
  }

  if (message.deletedForEveryone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot vote on deleted poll');
  }

  const isDeletedForUser = (message.deletedFor || []).some(
    (entry) => toObjectIdString(entry) === toObjectIdString(userId),
  );
  if (isDeletedForUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const pollOptions = message.content?.poll?.options || [];
  const pollAllowMultiple = Boolean(message.content?.poll?.allowMultipleChoice);
  const pollExpiresAt = message.content?.poll?.expiresAt
    ? new Date(message.content.poll.expiresAt)
    : null;

  if (pollExpiresAt && pollExpiresAt.getTime() <= Date.now()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Poll has ended');
  }

  const index = Number(optionIndex);
  if (!Number.isInteger(index) || index < 0 || index >= pollOptions.length) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid poll option');
  }

  const userIdString = toObjectIdString(userId);
  const selectedVotes = pollOptions[index].votes || [];
  const alreadySelected = selectedVotes.some(
    (entry) => toObjectIdString(entry) === userIdString,
  );

  if (pollAllowMultiple) {
    if (alreadySelected) {
      pollOptions[index].votes = pollOptions[index].votes.filter(
        (entry) => toObjectIdString(entry) !== userIdString,
      );
    } else {
      pollOptions[index].votes.push(userId);
    }
  } else {
    for (const option of pollOptions) {
      option.votes = (option.votes || []).filter(
        (entry) => toObjectIdString(entry) !== userIdString,
      );
    }

    if (!alreadySelected) {
      pollOptions[index].votes.push(userId);
    }
  }

  message.markModified('content.poll.options');
  await message.save();
  return populateMessage(message.id);
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchMessages = async ({ conversationId, userId, query, limit = 30 }) => {
  const regex = new RegExp(escapeRegex(query), 'i');

  const items = await Message.find({
    conversation: conversationId,
    deletedForEveryone: { $ne: true },
    deletedFor: { $ne: userId },
    'content.text': regex,
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .populate('sender', 'username displayName avatar')
    .populate('content.poll.options.votes', 'username displayName avatar')
    .populate({
      path: 'replyTo',
      select: 'content type sender',
      populate: { path: 'sender', select: 'username displayName avatar' },
    });

  return items.map((message) => sanitizeForViewer(message, userId)).filter(Boolean);
};

export const markMessageDelivered = async ({ conversationId, messageId, userId }) => {
  const existing = await Message.findOne({
    _id: messageId,
    conversation: conversationId,
    deletedForEveryone: { $ne: true },
    deletedFor: { $ne: userId },
  });

  if (!existing) return null;

  if (toObjectIdString(existing.sender) === toObjectIdString(userId)) {
    return null;
  }

  const updateResult = await Message.updateOne(
    {
      _id: messageId,
      conversation: conversationId,
      deletedForEveryone: { $ne: true },
      deletedFor: { $ne: userId },
      sender: { $ne: userId },
      'deliveredTo.user': { $ne: userId },
    },
    {
      $push: {
        deliveredTo: { user: userId, at: new Date() },
      },
    },
  );

  if (updateResult.modifiedCount === 0) {
    return null;
  }

  return populateMessage(existing.id);
};

export const markConversationRead = async ({ conversationId, userId }) => {
  const now = new Date();
  const emittedMessageIds = [];
  let lastReadMessageId = null;
  let hasMoreUpdated = false;

  while (true) {
    const messagesToMark = await Message.find({
      conversation: conversationId,
      sender: { $ne: userId },
      deletedForEveryone: { $ne: true },
      deletedFor: { $ne: userId },
      'readBy.user': { $ne: userId },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(env.READ_RECEIPT_BATCH_SIZE)
      .select('_id');

    if (messagesToMark.length === 0) {
      break;
    }

    const batchIds = messagesToMark.map((message) => message._id);
    if (!lastReadMessageId && batchIds[0]) {
      lastReadMessageId = batchIds[0];
    }

    const remainingEmitCapacity = env.READ_RECEIPT_EMIT_MAX_IDS - emittedMessageIds.length;
    if (remainingEmitCapacity > 0) {
      emittedMessageIds.push(...batchIds.slice(0, remainingEmitCapacity));
    } else {
      hasMoreUpdated = true;
    }

    await Message.bulkWrite(
      batchIds.map((id) => ({
        updateOne: {
          filter: {
            _id: id,
            'readBy.user': { $ne: userId },
          },
          update: {
            $push: {
              readBy: { user: userId, at: now },
              deliveredTo: { user: userId, at: now },
            },
          },
        },
      })),
    );

    if (messagesToMark.length < env.READ_RECEIPT_BATCH_SIZE) {
      break;
    }

    hasMoreUpdated = true;
  }

  await Conversation.updateOne(
    { _id: conversationId, 'participants.user': userId },
    {
      $set: {
        'participants.$.unreadCount': 0,
        ...(lastReadMessageId ? { 'participants.$.lastReadMessage': lastReadMessageId } : {}),
        lastActivityAt: new Date(),
      },
    },
  );

  return {
    messageIds: emittedMessageIds.map((id) => toObjectIdString(id)),
    userId: toObjectIdString(userId),
    at: now.toISOString(),
    hasMoreUpdated,
  };
};
