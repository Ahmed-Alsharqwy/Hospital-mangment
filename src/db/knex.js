// src/db/knex.js
const knex = require('knex');
const config = require('../config/database');

const db = knex(config);

// Test connection on startup
async function testConnection() {
  try {
    await db.raw('SELECT 1');
    console.log('✅ Database connected successfully');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { db, testConnection };
