import { verifyAccessToken } from '../../utils/jwt.js';
import { User } from '../../models/User.js';

export const socketAuth = async (socket, next) => {
  try {
    const authToken = socket.handshake.auth?.token;
    const bearerToken = socket.handshake.headers.authorization?.replace('Bearer ', '');
    const token = authToken || bearerToken;

    if (!token) {
      return next(new Error('Unauthorized: missing access token'));
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('_id username displayName avatar');

    if (!user) {
      return next(new Error('Unauthorized: user not found'));
    }

    socket.user = user;
    return next();
  } catch {
    return next(new Error('Unauthorized: invalid token'));
  }
};
