import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  requestEmailOtpLoginByPhone,
  buildSafeUser,
  requestEmailOtpLogin,
  verifyEmailOtpLoginByPhone,
  verifyEmailOtpLogin,
  requestOtpLogin,
  verifyOtpLogin,
  loginUser,
  logoutSession,
  logoutAllSessions,
  matchContactsByPhone,
  refreshSession,
  registerUser,
} from '../services/authService.js';
import {
  canUsePush,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../services/pushService.js';

const getRequestContext = (req) => ({
  userAgent: req.get('user-agent') || '',
  ip: req.ip,
});

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.validatedBody, getRequestContext(req));
  created(res, result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.validatedBody, getRequestContext(req));
  ok(res, result);
});

export const otpRequest = asyncHandler(async (req, res) => {
  const result = await requestOtpLogin(req.validatedBody);
  ok(res, result);
});

export const otpVerify = asyncHandler(async (req, res) => {
  const result = await verifyOtpLogin(req.validatedBody, getRequestContext(req));
  ok(res, result);
});

export const emailOtpRequest = asyncHandler(async (req, res) => {
  const result = await requestEmailOtpLogin(req.validatedBody);
  ok(res, result);
});

export const emailOtpRequestByPhone = asyncHandler(async (req, res) => {
  const result = await requestEmailOtpLoginByPhone(req.validatedBody);
  ok(res, result);
});

export const emailOtpVerify = asyncHandler(async (req, res) => {
  const result = await verifyEmailOtpLogin(req.validatedBody, getRequestContext(req));
  ok(res, result);
});

export const emailOtpVerifyByPhone = asyncHandler(async (req, res) => {
  const result = await verifyEmailOtpLoginByPhone(req.validatedBody, getRequestContext(req));
  ok(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.validatedBody;
  const result = await refreshSession(refreshToken, getRequestContext(req));
  ok(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.validatedBody;
  await logoutSession(req.user.id, refreshToken);
  ok(res, { message: 'Logged out successfully' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await logoutAllSessions(req.user.id);
  ok(res, { message: 'Logged out of all sessions successfully' });
});

export const me = asyncHandler(async (req, res) => {
  ok(res, {
    ...buildSafeUser(req.user),
    pushEnabled: canUsePush(),
  });
});

export const subscribePush = asyncHandler(async (req, res) => {
  const success = await registerPushSubscription({
    userId: req.user.id,
    subscription: req.validatedBody,
    userAgent: req.get('user-agent') || '',
  });

  ok(res, { subscribed: success, pushEnabled: canUsePush() });
});

export const unsubscribePush = asyncHandler(async (req, res) => {
  await unregisterPushSubscription({
    userId: req.user.id,
    endpoint: req.validatedBody.endpoint,
  });

  ok(res, { unsubscribed: true });
});

export const matchContacts = asyncHandler(async (req, res) => {
  const result = await matchContactsByPhone({
    userId: req.user.id,
    phones: req.validatedBody.phones,
  });

  ok(res, result);
});
