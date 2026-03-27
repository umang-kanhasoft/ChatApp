import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const buildErrorBody = ({ req, code, message, details }) => ({
  success: false,
  error: {
    code,
    message,
    details,
    requestId: req?.requestId,
  },
});

export const notFoundHandler = (req, _res, next) => {
  next(
    new ApiError(
      StatusCodes.NOT_FOUND,
      `Route not found: ${req.method} ${req.originalUrl}`,
      null,
      'ROUTE_NOT_FOUND',
    ),
  );
};

export const errorHandler = (err, req, res, _next) => {
  if (err?.name === 'MulterError') {
    return res.status(StatusCodes.BAD_REQUEST).json(
      buildErrorBody({
        req,
        code: 'UPLOAD_ERROR',
        message: err.message,
      }),
    );
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(
      buildErrorBody({
        req,
        code: err.code,
        message: err.message,
        details: err.details,
      }),
    );
  }

  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal server error';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  (req?.log || logger).error('unhandled request error', {
    code,
    statusCode,
    error: err,
  });

  return res.status(statusCode).json(
    buildErrorBody({
      req,
      code,
      message,
      details: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    }),
  );
};
