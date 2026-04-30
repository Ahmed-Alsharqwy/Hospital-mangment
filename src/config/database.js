// src/config/database.js
require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL || {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'medical_hub',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    // Auto-destroy idle connections after 30 seconds
    idleTimeoutMillis: 30000,
    // Kill connections that take more than 10s to connect
    acquireTimeoutMillis: 10000,
  },
  // snake_case columns → camelCase in JS automatically
  wrapIdentifier: (value, origImpl) => origImpl(value),
  postProcessResponse: (result) => result,
};
