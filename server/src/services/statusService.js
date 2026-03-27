import { StatusCodes } from 'http-status-codes';
import sanitizeHtml from 'sanitize-html';
import { Status } from '../models/Status.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

const sanitizeText = (value) =>
  sanitizeHtml(value || '', {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();

const toStringId = (value) => String(value);

const populateStatus = (query) =>
  query
    .populate('user', 'username displayName avatar blockedUsers contacts')
    .populate('viewedBy.user', 'username displayName avatar')
    .populate('reactions.user', 'username displayName avatar');

const normalizeStatusForViewer = (statusDoc, viewerId) => {
  const status = statusDoc.toObject ? statusDoc.toObject() : statusDoc;
  const viewerIdString = toStringId(viewerId);

  return {
    ...status,
    hasViewed: (status.viewedBy || []).some(
      (view) => toStringId(view.user?._id || view.user) === viewerIdString,
    ),
    myReaction:
      (status.reactions || []).find(
        (reaction) => toStringId(reaction.user?._id || reaction.user) === viewerIdString,
      )?.emoji || null,
  };
};

const getBlockedExclusionSet = async (viewerId) => {
  const me = await User.findById(viewerId).select('blockedUsers').lean();
  const blockedByUsers = await User.find({ blockedUsers: viewerId }).select('_id').lean();

  const ids = new Set([toStringId(viewerId)]);
  for (const id of me?.blockedUsers || []) {
    ids.add(toStringId(id));
  }
  for (const item of blockedByUsers) {
    ids.add(toStringId(item._id));
  }

  return ids;
};

export const createStatusEntry = async ({ userId, type, text, mediaUrl, caption, privacy, allowedUsers }) => {
  const cleanedText = sanitizeText(text);
  const cleanedCaption = sanitizeText(caption);
  const cleanedMediaUrl = (mediaUrl || '').trim();

  if (type === 'text' && !cleanedText) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Status text is required');
  }

  if (type !== 'text' && !cleanedMediaUrl) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Media URL is required for non-text statuses');
  }

  const uniqueAllowedUsers = [...new Set((allowedUsers || []).map(toStringId))].filter(Boolean);

  const status = await Status.create({
    user: userId,
    type,
    text: cleanedText,
    mediaUrl: cleanedMediaUrl,
    caption: cleanedCaption,
    privacy,
    allowedUsers: uniqueAllowedUsers,
  });

  return Status.findById(status.id)
    .populate('user', 'username displayName avatar')
    .populate('viewedBy.user', 'username displayName avatar')
    .populate('reactions.user', 'username displayName avatar');
};

const isAllowedByPrivacy = (status, viewerId, contactSet) => {
  const viewerIdString = toStringId(viewerId);

  if (toStringId(status.user?._id || status.user) === viewerIdString) {
    return true;
  }

  if (status.privacy === 'all') {
    return true;
  }

  if (status.privacy === 'contacts') {
    return contactSet.has(viewerIdString);
  }

  if (status.privacy === 'private') {
    return (status.allowedUsers || []).some((id) => toStringId(id?._id || id) === viewerIdString);
  }

  return false;
};

export const listStatusFeed = async ({ userId }) => {
  const exclusionSet = await getBlockedExclusionSet(userId);

  const statuses = await populateStatus(
    Status.find({
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(200),
  ).lean();

  const items = [];

  for (const status of statuses) {
    const ownerId = toStringId(status.user?._id || status.user);
    if (exclusionSet.has(ownerId) && ownerId !== toStringId(userId)) {
      continue;
    }

    const contactSet = new Set((status.user?.contacts || []).map(toStringId));
    if (!isAllowedByPrivacy(status, userId, contactSet)) {
      continue;
    }

    items.push(normalizeStatusForViewer(status, userId));
  }

  return items;
};

const getVisibleStatusForViewer = async ({ statusId, userId }) => {
  const status = await populateStatus(Status.findById(statusId));
  if (!status) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Status not found');
  }

  const exclusionSet = await getBlockedExclusionSet(userId);
  const ownerId = toStringId(status.user?._id || status.user);
  if (exclusionSet.has(ownerId) && ownerId !== toStringId(userId)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot access this status');
  }

  const contactSet = new Set((status.user?.contacts || []).map(toStringId));
  if (!isAllowedByPrivacy(status, userId, contactSet)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot access this status');
  }

  return status;
};

export const markStatusViewed = async ({ statusId, userId }) => {
  const status = await getVisibleStatusForViewer({ statusId, userId });

  const exists = status.viewedBy.some((entry) => toStringId(entry.user) === toStringId(userId));
  if (!exists) {
    status.viewedBy.push({ user: userId, at: new Date() });
    await status.save();
  }

  return populateStatus(Status.findById(status.id));
};

export const reactToStatus = async ({ statusId, userId, emoji }) => {
  const status = await getVisibleStatusForViewer({ statusId, userId });

  const index = status.reactions.findIndex((entry) => toStringId(entry.user) === toStringId(userId));

  if (index === -1) {
    status.reactions.push({ user: userId, emoji, at: new Date() });
  } else if (status.reactions[index].emoji === emoji) {
    status.reactions.splice(index, 1);
  } else {
    status.reactions[index].emoji = emoji;
    status.reactions[index].at = new Date();
  }

  await status.save();

  return populateStatus(Status.findById(status.id));
};

export const deleteStatusEntry = async ({ statusId, userId }) => {
  const status = await Status.findById(statusId);
  if (!status) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Status not found');
  }

  if (toStringId(status.user) !== toStringId(userId)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Only owner can delete status');
  }

  await Status.deleteOne({ _id: statusId });
  return { deleted: true };
};
