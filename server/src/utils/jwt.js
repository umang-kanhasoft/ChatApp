import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const isNeverExpiring = String(env.JWT_REFRESH_EXPIRES_IN || '').trim().toLowerCase() === 'never';

export const signAccessToken = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
  });

export const signRefreshToken = (payload) =>
  jwt.sign(
    payload,
    env.JWT_REFRESH_SECRET,
    isNeverExpiring
      ? {
          issuer: env.JWT_ISSUER,
        }
      : {
          expiresIn: env.JWT_REFRESH_EXPIRES_IN,
          issuer: env.JWT_ISSUER,
        },
  );

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: env.JWT_ISSUER });

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: env.JWT_ISSUER });

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
