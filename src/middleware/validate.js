// src/middleware/validate.js
const AppError = require('../utils/AppError');

/**
 * Validates req.body / req.query / req.params against a Joi schema.
 * @param {Joi.Schema} schema
 * @param {'body'|'query'|'params'} source
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,   // Return all errors, not just first
      stripUnknown: true,  // Remove unknown fields silently
    });

    if (error) {
      console.log('❌ Validation Error:', JSON.stringify(error.details, null, 2));
      const details = error.details.map(d => ({
        field:   d.path.join('.'),
        message: d.message.replace(/"/g, ''),
      }));
      const err = AppError.badRequest('Validation error', 'VALIDATION_ERROR');
      err.details = details;
      err.isJoi = true;
      throw err;
    }

    req[source] = value; // Replace with sanitized value
    next();
  };
}

module.exports = validate;
