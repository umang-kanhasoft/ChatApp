import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { blockUser, createReport, listBlockedUsers, unblockUser } from '../services/moderationService.js';

export const getBlockedUsers = asyncHandler(async (req, res) => {
  const users = await listBlockedUsers({ userId: req.user.id });
  ok(res, users);
});

export const blockTargetUser = asyncHandler(async (req, res) => {
  const result = await blockUser({
    userId: req.user.id,
    targetUserId: req.params.userId,
  });

  ok(res, result);
});

export const unblockTargetUser = asyncHandler(async (req, res) => {
  const result = await unblockUser({
    userId: req.user.id,
    targetUserId: req.params.userId,
  });

  ok(res, result);
});

export const reportTarget = asyncHandler(async (req, res) => {
  const report = await createReport({
    reporterId: req.user.id,
    targetType: req.validatedBody.targetType,
    targetId: req.validatedBody.targetId,
    reason: req.validatedBody.reason,
    details: req.validatedBody.details,
  });

  created(res, report);
});
