import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../utils/ApiError.js';

export const validateBody = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return next(
      new ApiError(
        StatusCodes.BAD_REQUEST,
        'Invalid request body',
        parsed.error.flatten(),
        'VALIDATION_ERROR',
      ),
    );
  }

  req.validatedBody = parsed.data;
  return next();
};

export const validateQuery = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return next(
      new ApiError(
        StatusCodes.BAD_REQUEST,
        'Invalid request query',
        parsed.error.flatten(),
        'VALIDATION_ERROR',
      ),
    );
  }

  req.validatedQuery = parsed.data;
  return next();
};
