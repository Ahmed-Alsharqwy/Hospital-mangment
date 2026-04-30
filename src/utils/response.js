// src/utils/response.js

/**
 * Success response
 * { success: true, message, data, meta }
 */
const ok = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const body = { success: true, message };
  if (data !== null)  body.data = data;
  if (meta !== null)  body.meta = meta;
  return res.status(statusCode).json(body);
};

const created = (res, data, message = 'Created successfully') =>
  ok(res, data, message, 201);

/**
 * Paginated response
 */
const paginated = (res, data, { page, limit, total }) =>
  ok(res, data, 'Success', 200, {
    page:        parseInt(page),
    limit:       parseInt(limit),
    total,
    total_pages: Math.ceil(total / limit),
    has_next:    page * limit < total,
  });

/**
 * Error response (used by global error handler)
 */
const error = (res, message, statusCode = 500, code = null, details = null) => {
  const body = { success: false, message };
  if (code)    body.code    = code;
  if (details) body.details = details;
  return res.status(statusCode).json(body);
};

module.exports = { ok, created, paginated, error };
