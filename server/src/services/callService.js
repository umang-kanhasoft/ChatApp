import { StatusCodes } from 'http-status-codes';
import { CallLog } from '../models/CallLog.js';
import { ApiError } from '../utils/ApiError.js';

const populateCallLog = (query) =>
  query
    .populate('caller', 'username displayName avatar')
    .populate('callee', 'username displayName avatar')
    .populate('conversation', 'type title participants');

export const createCallLog = async ({ conversationId, callerId, calleeId, type }) => {
  const call = await CallLog.create({
    conversation: conversationId,
    caller: callerId,
    callee: calleeId,
    type,
    status: 'ringing',
  });

  return populateCallLog(CallLog.findById(call.id));
};

const findCall = async (callId) => {
  const call = await CallLog.findById(callId);
  if (!call) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Call not found');
  }

  return call;
};

export const getCallLogById = async ({ callId }) => findCall(callId);

export const acceptCallLog = async ({ callId }) => {
  const updated = await CallLog.findOneAndUpdate(
    {
      _id: callId,
      status: 'ringing',
    },
    {
      $set: {
        status: 'ongoing',
        startedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );

  if (updated) {
    return populateCallLog(CallLog.findById(updated.id));
  }

  const call = await findCall(callId);
  return populateCallLog(CallLog.findById(call.id));
};

export const declineCallLog = async ({ callId }) => {
  const updated = await CallLog.findOneAndUpdate(
    {
      _id: callId,
      status: 'ringing',
    },
    {
      $set: {
        status: 'declined',
        endedAt: new Date(),
        duration: 0,
      },
    },
    {
      new: true,
    },
  );

  if (updated) {
    return populateCallLog(CallLog.findById(updated.id));
  }

  const call = await findCall(callId);
  return populateCallLog(CallLog.findById(call.id));
};

export const endCallLog = async ({ callId, duration = 0 }) => {
  const safeDuration = Math.max(0, Math.floor(duration));

  const completed = await CallLog.findOneAndUpdate(
    {
      _id: callId,
      status: 'ongoing',
    },
    {
      $set: {
        status: 'completed',
        endedAt: new Date(),
        duration: safeDuration,
      },
    },
    {
      new: true,
    },
  );

  if (completed) {
    return populateCallLog(CallLog.findById(completed.id));
  }

  const missed = await CallLog.findOneAndUpdate(
    {
      _id: callId,
      status: 'ringing',
    },
    {
      $set: {
        status: 'missed',
        endedAt: new Date(),
        duration: 0,
      },
    },
    {
      new: true,
    },
  );

  if (missed) {
    return populateCallLog(CallLog.findById(missed.id));
  }

  const call = await findCall(callId);
  return populateCallLog(CallLog.findById(call.id));
};

export const markCallMissedIfRinging = async ({ callId }) => {
  const updated = await CallLog.findOneAndUpdate(
    {
      _id: callId,
      status: 'ringing',
    },
    {
      $set: {
        status: 'missed',
        endedAt: new Date(),
        duration: 0,
      },
    },
    {
      new: true,
    },
  );

  if (updated) {
    return populateCallLog(CallLog.findById(updated.id));
  }

  const call = await findCall(callId);
  return populateCallLog(CallLog.findById(call.id));
};

export const listCallHistory = async ({ userId, limit = 30 }) => {
  const parsedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 30;
  const safeLimit = Math.min(Math.max(parsedLimit, 1), 100);

  const items = await populateCallLog(
    CallLog.find({
      $or: [{ caller: userId }, { callee: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(safeLimit),
  );

  return items;
};
