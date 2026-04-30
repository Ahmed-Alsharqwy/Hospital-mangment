// src/middleware/errorHandler.js
const AppError = require('../utils/AppError');
const { error }  = require('../utils/response');

module.exports = function errorHandler(err, req, res, next) {
  // Already an operational error
  if (err.isOperational) {
    return error(res, err.message, err.statusCode, err.code, err.details);
  }

  // Knex / PostgreSQL errors
  if (err.code === '23505') {
    // Unique constraint violation
    const field = err.detail?.match(/\((.+?)\)/)?.[1] || 'field';
    return error(res, `${field} already exists`, 409, 'DUPLICATE_ENTRY');
  }

  if (err.code === '23503') {
    // Foreign key violation
    return error(res, 'Referenced record does not exist', 400, 'FOREIGN_KEY_VIOLATION');
  }

  if (err.code === '23514') {
    // Check constraint violation
    return error(res, 'Data validation failed', 400, 'CHECK_CONSTRAINT');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return error(res, 'Invalid token', 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    return error(res, 'Token has expired', 401, 'TOKEN_EXPIRED');
  }

  // Joi validation errors (from express-async-errors + validate middleware)
  if (err.isJoi) {
    return error(
      res,
      'Validation error',
      400,
      'VALIDATION_ERROR',
      err.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    );
  }

  // Unknown error — log it, don't expose internals
  console.error('💥 Unhandled error:', err.stack || err);
  return error(res, 'Something went wrong. Please try again.', 500, 'INTERNAL_ERROR');
};
