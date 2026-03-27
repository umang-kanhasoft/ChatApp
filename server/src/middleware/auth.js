import { StatusCodes } from 'http-status-codes';
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

export const requireAuth = async (req, _res, next) => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return next(
      new ApiError(StatusCodes.UNAUTHORIZED, 'Access token is required', null, 'AUTH_REQUIRED'),
    );
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('_id username displayName avatar email phone');

    if (!user) {
      return next(new ApiError(StatusCodes.UNAUTHORIZED, 'User not found', null, 'AUTH_INVALID'));
    }

    req.user = user;
    req.auth = payload;
    return next();
  } catch {
    return next(
      new ApiError(
        StatusCodes.UNAUTHORIZED,
        'Invalid or expired access token',
        null,
        'AUTH_INVALID',
      ),
    );
  }
};
