import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

export const requestContext = (req, res, next) => {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.originalUrl,
  });
  res.setHeader('x-request-id', requestId);
  next();
};

export const requestLogger = (req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    req.log?.info('request completed', {
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  });

  next();
};
