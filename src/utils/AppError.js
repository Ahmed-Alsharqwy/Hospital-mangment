// src/utils/AppError.js

class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;        // e.g. 'DUPLICATE_EMAIL', 'NOT_FOUND'
    this.isOperational = true;     // Distinguishes known errors from bugs
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code)  { return new AppError(message, 400, code); }
  static unauthorized(message)       { return new AppError(message || 'Unauthorized', 401, 'UNAUTHORIZED'); }
  static forbidden(message)          { return new AppError(message || 'Forbidden', 403, 'FORBIDDEN'); }
  static notFound(resource)          { return new AppError(`${resource} not found`, 404, 'NOT_FOUND'); }
  static conflict(message, code)     { return new AppError(message, 409, code); }
  static tooManyRequests(message)    { return new AppError(message || 'Too many requests', 429, 'TOO_MANY_REQUESTS'); }
  static internal(message)           { return new AppError(message || 'Internal server error', 500, 'INTERNAL_ERROR'); }
}

module.exports = AppError;
