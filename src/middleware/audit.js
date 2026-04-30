// src/middleware/audit.js
const { db } = require('../db/knex');

/**
 * Logs an action to audit_logs table.
 * Called manually from service layer, not as route middleware.
 */
async function logAudit({ userId, action, entityType, entityId, oldValues, newValues, req }) {
  try {
    await db('audit_logs').insert({
      user_id:     userId || null,
      action,                           // 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT'
      entity_type: entityType,
      entity_id:   entityId || null,
      old_values:  oldValues ? JSON.stringify(oldValues) : null,
      new_values:  newValues ? JSON.stringify(newValues) : null,
      ip_address:  req?.ip || null,
      user_agent:  req?.get('user-agent') || null,
    });
  } catch (err) {
    // Audit log failure should never crash the app
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
