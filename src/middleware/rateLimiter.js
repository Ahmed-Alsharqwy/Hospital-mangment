// src/middleware/rateLimiter.js
const AppError = require('../utils/AppError');

const memoryStore = new Map();

/**
 * Simple in-memory rate limiter to prevent brute-force/DOS
 * Note: In a real production app, use Redis or a library like express-rate-limit.
 */
function rateLimiter({ windowMs, max, message }) {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    if (!memoryStore.has(ip)) {
      memoryStore.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const data = memoryStore.get(ip);

    if (now > data.resetTime) {
      data.count = 1;
      data.resetTime = now + windowMs;
      return next();
    }

    data.count++;
    if (data.count > max) {
      throw AppError.tooManyRequests(message || 'Too many requests, please try again later');
    }

    next();
  };
}

module.exports = rateLimiter;
