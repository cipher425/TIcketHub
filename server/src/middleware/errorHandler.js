import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { logger } from '../infra/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { code: 'INVALID_ID', message: `Invalid value for ${err.path}` };
  } else if (err?.code === 11000) {
    status = 409;
    body = { code: 'DUPLICATE', message: 'A record with these details already exists', details: err.keyValue };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'INVALID_JSON', message: 'Malformed JSON body' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' };
  }

  if (status >= 500) (req.log || logger).error({ err }, 'Unhandled error');
  res.status(status).json({ error: body });
}
