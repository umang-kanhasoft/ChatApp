import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  createStatusEntry,
  deleteStatusEntry,
  listStatusFeed,
  markStatusViewed,
  reactToStatus,
} from '../services/statusService.js';
import { ApiError } from '../utils/ApiError.js';
import { uploadToCloudinary } from '../services/media.js';

export const getStatusFeed = asyncHandler(async (req, res) => {
  const items = await listStatusFeed({ userId: req.user.id });
  ok(res, items);
});

export const createStatus = asyncHandler(async (req, res) => {
  const status = await createStatusEntry({
    userId: req.user.id,
    type: req.validatedBody.type,
    text: req.validatedBody.text,
    mediaUrl: req.validatedBody.mediaUrl,
    caption: req.validatedBody.caption,
    privacy: req.validatedBody.privacy,
    allowedUsers: req.validatedBody.allowedUsers,
  });

  created(res, status);
});

export const createStatusFromUpload = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'No file uploaded');
  }

  const mimeType = req.file.mimetype;
  const type = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : null;

  if (!type) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Status upload supports image/video only');
  }

  const cloud = await uploadToCloudinary({
    filePath: req.file.path,
    folder: `chatapp/status/${req.user.id}`,
    resourceType: 'auto',
  });

  const mediaUrl = cloud.secureUrl || `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  const status = await createStatusEntry({
    userId: req.user.id,
    type,
    mediaUrl,
    caption: req.body?.caption || '',
    privacy: req.body?.privacy || 'all',
    allowedUsers: [],
    text: '',
  });

  created(res, status);
});

export const viewStatus = asyncHandler(async (req, res) => {
  const status = await markStatusViewed({
    statusId: req.params.statusId,
    userId: req.user.id,
  });

  ok(res, status);
});

export const reactStatus = asyncHandler(async (req, res) => {
  const status = await reactToStatus({
    statusId: req.params.statusId,
    userId: req.user.id,
    emoji: req.validatedBody.emoji,
  });

  ok(res, status);
});

export const deleteStatus = asyncHandler(async (req, res) => {
  const result = await deleteStatusEntry({
    statusId: req.params.statusId,
    userId: req.user.id,
  });

  ok(res, result);
});
