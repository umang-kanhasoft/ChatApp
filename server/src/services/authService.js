import crypto from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { OtpCode } from '../models/OtpCode.js';
import { getMailCapability } from '../config/mailTransporter.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { getPhoneLookupCandidates, normalizePhone } from '../utils/phone.js';
import { logger } from '../utils/logger.js';
import MailService from './MailService.js';

const mailService = new MailService();
const EMAIL_DELIVERY_UNAVAILABLE_MESSAGE =
  'Email delivery is unavailable. Configure SMTP and try again.';
const PHONE_OTP_UNAVAILABLE_MESSAGE =
  'Phone OTP delivery is unavailable. Configure an SMS provider and try again.';
const REFRESH_SESSION_STATUSES = new Set(['active', 'rotated', 'revoked', 'compromised']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeStringValue = (value) => String(value || '').trim();

const parseOptionalDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildAuthPayload = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  email: user.email,
  phone: user.phone || '',
  avatar: user.avatar,
  about: user.about || '',
});

const generateOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const ensurePhoneOtpAvailable = () => {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  throw new ApiError(
    StatusCodes.SERVICE_UNAVAILABLE,
    PHONE_OTP_UNAVAILABLE_MESSAGE,
    null,
    'PHONE_OTP_UNAVAILABLE',
  );
};

const sendOtpCode = async (phone) => {
  ensurePhoneOtpAvailable();
  logger.warn('phone OTP requested without a configured SMS provider', { phone });
};

const sendEmailOtp = async (email, code) => {
  await mailService.sendMail({
    email,
    subject: 'Your ChatApp verification code',
    template: 'otp',
    code,
    expiresIn: 10,
  });
};

const ensureEmailDeliveryAvailable = () => {
  const capability = getMailCapability();
  if (capability.available) {
    return;
  }

  logger.error('email OTP requested while delivery is unavailable', {
    mailCapability: capability,
  });
  throw new ApiError(
    StatusCodes.SERVICE_UNAVAILABLE,
    EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
    null,
    'EMAIL_OTP_UNAVAILABLE',
  );
};

const saveEmailOtpRecord = async ({ email, codeHash, expiresAt }) =>
  OtpCode.findOneAndUpdate(
    { email },
    {
      email,
      codeHash,
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
      consumed: false,
      createdAt: new Date(),
    },
    { upsert: true, new: true },
  );

const cleanupFailedEmailOtpRecord = async ({ email, codeHash }) => {
  try {
    await OtpCode.deleteOne({ email, codeHash });
  } catch (error) {
    logger.error('failed to clean up email OTP record', { email, error });
  }
};

const sendEmailOtpWithCleanup = async ({ email, code, codeHash }) => {
  try {
    await sendEmailOtp(email, code);
  } catch (error) {
    logger.error('failed to deliver OTP email', { email, error });
    await cleanupFailedEmailOtpRecord({ email, codeHash });
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
      null,
      'EMAIL_OTP_UNAVAILABLE',
    );
  }
};

const buildTokenPayload = (user, sessionId) => ({
  sub: user.id,
  username: user.username,
  sid: sessionId,
});

const decodeRefreshExpiration = (refreshToken) => {
  const decoded = jwt.decode(refreshToken);
  return decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 86400000);
};

const createSessionRecord = ({ refreshToken, sessionId, userAgent, ip }) => ({
  sessionId,
  tokenHash: hashToken(refreshToken),
  status: 'active',
  userAgent: userAgent || '',
  ip: ip || '',
  expiresAt: decodeRefreshExpiration(refreshToken),
  createdAt: new Date(),
  lastUsedAt: new Date(),
  rotatedAt: null,
  replacedBySessionId: '',
  revokedAt: null,
});

const buildSessionPayload = (record) => ({
  id: record.sessionId,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  userAgent: record.userAgent || '',
  ip: record.ip || '',
  status: record.status,
});

const createSessionBundle = (user, ctx = {}) => {
  const sessionId = crypto.randomUUID();
  const payload = buildTokenPayload(user, sessionId);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const record = createSessionRecord({
    refreshToken,
    sessionId,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });

  return {
    accessToken,
    refreshToken,
    record,
    session: buildSessionPayload(record),
  };
};

const normalizeRefreshSessionRecord = (item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const sessionId =
    normalizeStringValue(item.sessionId) ||
    normalizeStringValue(item.sid) ||
    normalizeStringValue(item.id);
  const tokenHash = normalizeStringValue(item.tokenHash);
  const expiresAt = parseOptionalDate(item.expiresAt);

  if (!sessionId || !tokenHash || !expiresAt) {
    return null;
  }

  const createdAt = parseOptionalDate(item.createdAt) || new Date();
  const lastUsedAt = parseOptionalDate(item.lastUsedAt) || createdAt;

  return {
    sessionId,
    tokenHash,
    status: REFRESH_SESSION_STATUSES.has(item.status) ? item.status : 'active',
    userAgent: normalizeStringValue(item.userAgent),
    ip: normalizeStringValue(item.ip),
    expiresAt,
    createdAt,
    lastUsedAt,
    rotatedAt: parseOptionalDate(item.rotatedAt),
    replacedBySessionId: normalizeStringValue(item.replacedBySessionId),
    revokedAt: parseOptionalDate(item.revokedAt),
  };
};

const normalizeRefreshSessions = (sessions = [], { userId = '' } = {}) => {
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const normalizedSessions = sessionList
    .map((item) => normalizeRefreshSessionRecord(item))
    .filter(Boolean);
  const droppedCount = sessionList.length - normalizedSessions.length;

  if (droppedCount > 0) {
    logger.warn('dropping legacy or invalid refresh token records', {
      userId,
      droppedCount,
    });
  }

  return normalizedSessions;
};

const pruneRefreshSessions = (sessions = []) => {
  const now = Date.now();
  return sessions.filter((item) => new Date(item.expiresAt).getTime() > now);
};

const capActiveRefreshSessions = (sessions = []) => {
  const now = new Date();
  const activeSessions = sessions
    .filter((item) => item.status === 'active')
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  const allowedIds = new Set(
    activeSessions.slice(0, env.AUTH_SESSION_MAX_ACTIVE).map((item) => item.sessionId),
  );

  return sessions.map((item) => {
    if (item.status !== 'active') {
      return item;
    }

    if (allowedIds.has(item.sessionId)) {
      return item;
    }

    return {
      ...item,
      status: 'revoked',
      revokedAt: now,
    };
  });
};

const saveUserSessions = async (user) => {
  user.refreshTokens = capActiveRefreshSessions(
    pruneRefreshSessions(normalizeRefreshSessions(user.refreshTokens, { userId: user.id })),
  );
  await user.save();
};

const persistSessionForUser = async (userId, bundle) => {
  const sessionUser = await User.findById(userId).select('+refreshTokens');
  if (!sessionUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found', null, 'AUTH_INVALID');
  }

  sessionUser.refreshTokens.push(bundle.record);
  await saveUserSessions(sessionUser);
  return bundle;
};

const buildAuthResponse = (user, bundle) => ({
  user: buildAuthPayload(user),
  accessToken: bundle.accessToken,
  refreshToken: bundle.refreshToken,
  session: bundle.session,
});

const maskEmailAddress = (email) => {
  const normalizedEmail = normalizeEmail(email);
  const [localPart = '', domain = ''] = normalizedEmail.split('@');
  if (!localPart || !domain) return '';

  const [domainName = '', ...domainRest] = domain.split('.');
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] || ''}*`
      : `${localPart[0]}${'*'.repeat(Math.max(1, localPart.length - 2))}${localPart.at(-1)}`;
  const maskedDomain =
    domainName.length <= 2
      ? `${domainName[0] || ''}*`
      : `${domainName[0]}${'*'.repeat(Math.max(1, domainName.length - 2))}${domainName.at(-1)}`;

  return `${maskedLocal}@${[maskedDomain, ...domainRest].filter(Boolean).join('.')}`;
};

const findUserByPhoneForAuth = async (inputPhone) => {
  const candidates = getPhoneLookupCandidates(inputPhone);
  if (candidates.length === 0) {
    return { normalizedPhone: '', user: null, matchedLegacyPhone: '' };
  }

  const normalizedPhone = candidates[0];
  const user = await User.findOne({ phone: { $in: candidates } });
  if (!user) {
    return { normalizedPhone, user: null, matchedLegacyPhone: '' };
  }

  const matchedLegacyPhone = user.phone === normalizedPhone ? '' : user.phone || '';
  return { normalizedPhone, user, matchedLegacyPhone };
};

const maybeUpgradeLegacyPhone = async ({ user, normalizedPhone, matchedLegacyPhone }) => {
  if (!matchedLegacyPhone) {
    return;
  }

  try {
    await User.updateOne(
      { _id: user._id, phone: matchedLegacyPhone },
      { $set: { phone: normalizedPhone } },
    );
    user.phone = normalizedPhone;
  } catch (error) {
    logger.warn('failed to upgrade legacy phone format', {
      userId: user.id,
      normalizedPhone,
      matchedLegacyPhone,
      error,
    });
  }
};

const validateOtpRecord = async ({ record, lookupField, lookupValue }) => {
  if (!record || record.consumed || record.expiresAt <= new Date()) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'OTP expired or not found', null, 'OTP_INVALID');
  }

  if (record.attempts >= record.maxAttempts) {
    await OtpCode.deleteOne({ [lookupField]: lookupValue });
    throw new ApiError(
      StatusCodes.TOO_MANY_REQUESTS,
      'Too many invalid attempts',
      null,
      'OTP_ATTEMPTS_EXCEEDED',
    );
  }
};

const assertOtpMatch = async ({ record, code }) => {
  const match = await bcrypt.compare(code, record.codeHash);
  if (!match) {
    record.attempts += 1;
    await record.save();
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid code', null, 'OTP_INVALID');
  }
};

const issueSessionResponse = async (user, ctx) => {
  const bundle = createSessionBundle(user, ctx);
  await persistSessionForUser(user.id, bundle);
  return buildAuthResponse(user, bundle);
};

const revokeAllSessionsForUser = async (user, reason = '') => {
  const now = new Date();
  user.refreshTokens = normalizeRefreshSessions(user.refreshTokens, { userId: user.id }).map(
    (item) => ({
      ...item,
      status: item.status === 'compromised' ? item.status : 'compromised',
      revokedAt: item.revokedAt || now,
      replacedBySessionId: item.replacedBySessionId || reason,
    }),
  );
  await saveUserSessions(user);
};

export const registerUser = async ({ email, username, password, displayName, phone }, ctx) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = phone ? normalizePhone(phone) : '';
  if (phone && !normalizedPhone) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Invalid phone number format',
      null,
      'INVALID_PHONE',
    );
  }

  const conflictPredicates = [{ email: normalizedEmail }, { username: username.toLowerCase() }];
  if (normalizedPhone) {
    conflictPredicates.push({ phone: normalizedPhone });
  }

  const existing = await User.exists({ $or: conflictPredicates });

  if (existing) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Email, username, or phone already in use',
      null,
      'USER_CONFLICT',
    );
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    email: normalizedEmail,
    username,
    displayName,
    ...(normalizedPhone ? { phone: normalizedPhone } : {}),
    passwordHash,
  });

  const response = await issueSessionResponse(user, ctx);

  try {
    await mailService.sendMail({
      name: user.displayName || user.username,
      email: user.email,
      subject: 'Welcome to ChatApp!',
      template: 'welcome',
      link: env.CLIENT_URL,
    });
  } catch (error) {
    logger.warn('failed to send welcome email', { userId: user.id, error });
  }

  return response;
};

export const loginUser = async ({ identifier, password }, ctx) => {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(identifier);
  const user = await User.findOne({
    $or: [
      { email: normalizedIdentifier },
      { username: normalizedIdentifier },
      ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
    ],
  }).select('+passwordHash');

  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials', null, 'AUTH_INVALID');
  }

  const passwordValid = await user.verifyPassword(password);
  if (!passwordValid) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid credentials', null, 'AUTH_INVALID');
  }

  return issueSessionResponse(user, ctx);
};

export const requestOtpLogin = async ({ phone }) => {
  const { normalizedPhone, user } = await findUserByPhoneForAuth(phone);
  if (!normalizedPhone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid phone number', null, 'INVALID_PHONE');
  }

  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'Phone number is not registered',
      null,
      'PHONE_NOT_REGISTERED',
    );
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OtpCode.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      phone: normalizedPhone,
      codeHash,
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
      consumed: false,
      createdAt: new Date(),
    },
    { upsert: true, new: true },
  );

  await sendOtpCode(normalizedPhone, code);

  return { sent: true, expiresAt };
};

export const verifyOtpLogin = async ({ phone, code }, ctx) => {
  const { normalizedPhone, user: foundUser, matchedLegacyPhone } = await findUserByPhoneForAuth(phone);
  if (!normalizedPhone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid phone number', null, 'INVALID_PHONE');
  }

  const record = await OtpCode.findOne({ phone: normalizedPhone });
  await validateOtpRecord({ record, lookupField: 'phone', lookupValue: normalizedPhone });
  await assertOtpMatch({ record, code });

  if (!foundUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found', null, 'AUTH_INVALID');
  }

  await maybeUpgradeLegacyPhone({
    user: foundUser,
    normalizedPhone,
    matchedLegacyPhone,
  });

  record.consumed = true;
  await record.save();

  return issueSessionResponse(foundUser, ctx);
};

export const requestEmailOtpLogin = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid email', null, 'INVALID_EMAIL');
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'Email is not registered',
      null,
      'EMAIL_NOT_REGISTERED',
    );
  }

  ensureEmailDeliveryAvailable();

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await saveEmailOtpRecord({ email: normalizedEmail, codeHash, expiresAt });
  await sendEmailOtpWithCleanup({ email: normalizedEmail, code, codeHash });

  return {
    sent: true,
    expiresAt,
    message: 'Verification code sent to your email',
  };
};

export const requestEmailOtpLoginByPhone = async ({ phone }) => {
  const { normalizedPhone, user } = await findUserByPhoneForAuth(phone);
  if (!normalizedPhone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid phone number', null, 'INVALID_PHONE');
  }

  if (!user) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'Phone number is not registered',
      null,
      'PHONE_NOT_REGISTERED',
    );
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (!normalizedEmail) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'No email is associated with this account',
      null,
      'INVALID_EMAIL',
    );
  }

  ensureEmailDeliveryAvailable();

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await saveEmailOtpRecord({ email: normalizedEmail, codeHash, expiresAt });
  await sendEmailOtpWithCleanup({ email: normalizedEmail, code, codeHash });

  return {
    sent: true,
    expiresAt,
    emailHint: maskEmailAddress(normalizedEmail),
    message: 'Verification code sent to your email',
  };
};

export const verifyEmailOtpLogin = async ({ email, code }, ctx) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid email', null, 'INVALID_EMAIL');
  }

  const record = await OtpCode.findOne({ email: normalizedEmail });
  await validateOtpRecord({ record, lookupField: 'email', lookupValue: normalizedEmail });
  await assertOtpMatch({ record, code });

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found', null, 'AUTH_INVALID');
  }

  record.consumed = true;
  await record.save();

  return issueSessionResponse(user, ctx);
};

export const verifyEmailOtpLoginByPhone = async ({ phone, code }, ctx) => {
  const { normalizedPhone, user, matchedLegacyPhone } = await findUserByPhoneForAuth(phone);
  if (!normalizedPhone) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid phone number', null, 'INVALID_PHONE');
  }

  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found', null, 'AUTH_INVALID');
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (!normalizedEmail) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'No email is associated with this account',
      null,
      'INVALID_EMAIL',
    );
  }

  const record = await OtpCode.findOne({ email: normalizedEmail });
  await validateOtpRecord({ record, lookupField: 'email', lookupValue: normalizedEmail });
  await assertOtpMatch({ record, code });

  await maybeUpgradeLegacyPhone({
    user,
    normalizedPhone,
    matchedLegacyPhone,
  });

  record.consumed = true;
  await record.save();

  return issueSessionResponse(user, ctx);
};

export const refreshSession = async (refreshToken, ctx) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token', null, 'AUTH_INVALID');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not found', null, 'AUTH_INVALID');
  }

  user.refreshTokens = pruneRefreshSessions(
    normalizeRefreshSessions(user.refreshTokens, { userId: user.id }),
  );

  const tokenHash = hashToken(refreshToken);
  const session = user.refreshTokens.find((item) => item.sessionId === payload.sid);

  if (!session) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'Refresh token expired or revoked',
      null,
      'AUTH_INVALID',
    );
  }

  const isExpired = new Date(session.expiresAt) <= new Date();
  const hashMismatch = session.tokenHash !== tokenHash;
  const isReusableState = ['rotated', 'compromised'].includes(session.status);

  if (hashMismatch || isReusableState) {
    await revokeAllSessionsForUser(user, 'reuse-detected');
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'Refresh token reuse detected. Please log in again.',
      null,
      'TOKEN_REUSED',
    );
  }

  if (isExpired || session.status !== 'active') {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'Refresh token expired or revoked',
      null,
      'AUTH_INVALID',
    );
  }

  const nextBundle = createSessionBundle(user, ctx);
  session.status = 'rotated';
  session.rotatedAt = new Date();
  session.replacedBySessionId = nextBundle.session.id;
  session.lastUsedAt = new Date();
  user.refreshTokens.push(nextBundle.record);

  await saveUserSessions(user);

  return buildAuthResponse(user, nextBundle);
};

export const logoutSession = async (userId, refreshToken) => {
  if (!refreshToken) return;

  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  let sessionId = '';
  try {
    sessionId = verifyRefreshToken(refreshToken)?.sid || '';
  } catch {
    sessionId = '';
  }

  const tokenHash = hashToken(refreshToken);
  const now = new Date();
  user.refreshTokens = normalizeRefreshSessions(user.refreshTokens, { userId }).map((item) => {
    if (item.tokenHash !== tokenHash && item.sessionId !== sessionId) {
      return item;
    }

    return {
      ...item,
      status: 'revoked',
      revokedAt: now,
    };
  });

  await saveUserSessions(user);
};

export const logoutAllSessions = async (userId) => {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  const now = new Date();
  user.refreshTokens = normalizeRefreshSessions(user.refreshTokens, { userId }).map((item) => ({
    ...item,
    status: 'revoked',
    revokedAt: now,
  }));
  await saveUserSessions(user);
};

export const buildSafeUser = buildAuthPayload;

export const matchContactsByPhone = async ({ userId, phones }) => {
  const normalizedPhones = [...new Set((phones || []).map(normalizePhone).filter(Boolean))];
  if (!normalizedPhones.length) {
    return {
      matchedUsers: [],
      unmatchedPhones: [],
    };
  }

  const users = await User.find({
    _id: { $ne: userId },
    phone: { $in: normalizedPhones },
  })
    .select('username displayName avatar phone isOnline lastSeen')
    .lean();

  const matchedPhones = new Set(users.map((entry) => entry.phone).filter(Boolean));
  const unmatchedPhones = normalizedPhones.filter((phone) => !matchedPhones.has(phone));

  if (users.length > 0) {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { contacts: { $each: users.map((entry) => entry._id) } },
    });
  }

  return {
    matchedUsers: users.map((entry) => ({
      id: entry._id.toString(),
      username: entry.username,
      displayName: entry.displayName,
      avatar: entry.avatar || '',
      phone: entry.phone || '',
      isOnline: Boolean(entry.isOnline),
      lastSeen: entry.lastSeen || null,
    })),
    unmatchedPhones,
  };
};
