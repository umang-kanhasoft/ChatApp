import { StatusCodes } from 'http-status-codes';
import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { ApiError } from '../utils/ApiError.js';

const toStringId = (value) => String(value);

export const blockUser = async ({ userId, targetUserId }) => {
  if (toStringId(userId) === toStringId(targetUserId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Cannot block yourself');
  }

  const target = await User.exists({ _id: targetUserId });
  if (!target) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  await User.findByIdAndUpdate(userId, {
    $addToSet: {
      blockedUsers: targetUserId,
    },
  });

  return { blocked: true, targetUserId };
};

export const unblockUser = async ({ userId, targetUserId }) => {
  await User.findByIdAndUpdate(userId, {
    $pull: {
      blockedUsers: targetUserId,
    },
  });

  return { blocked: false, targetUserId };
};

export const listBlockedUsers = async ({ userId }) => {
  const user = await User.findById(userId).populate('blockedUsers', 'username displayName avatar').lean();
  return user?.blockedUsers || [];
};

export const createReport = async ({ reporterId, targetType, targetId, reason, details }) => {
  const report = await Report.create({
    reporter: reporterId,
    targetType,
    targetId,
    reason,
    details: details || '',
  });

  return Report.findById(report.id).populate('reporter', 'username displayName avatar');
};
