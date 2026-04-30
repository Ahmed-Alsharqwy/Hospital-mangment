// src/middleware/auth.js
const jwt     = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { db }  = require('../db/knex');

/**
 * Verifies JWT access token and attaches user to req.user
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('No token provided');
  }

  const token = authHeader.split(' ')[1];
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  // Fetch fresh user from DB (catches deactivated accounts)
  const user = await db('users')
    .where({ id: payload.sub, is_active: true })
    .select('id', 'branch_id', 'role', 'full_name', 'email')
    .first();

  if (!user) throw AppError.unauthorized('Account not found or deactivated');

  req.user = user;
  next();
}

/**
 * Role-based access control
 * @param {...string} roles - Allowed roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw AppError.forbidden(`Access restricted to: ${roles.join(', ')}`);
    }
    next();
  };
}

/**
 * Ensure doctor can only access their own resources
 */
async function ownDoctorOnly(req, res, next) {
  if (req.user.role === 'doctor') {
    const doctor = await db('doctors')
      .where({ user_id: req.user.id })
      .select('id')
      .first();

    if (!doctor) throw AppError.forbidden('Doctor profile not found');
    req.doctorId = doctor.id;
  }
  next();
}

/**
 * Dynamic permission check — checks per-user first, then role defaults
 * @param {string} module - module name (patients, appointments, etc)
 * @param {string} action - action (view, create, edit, delete)
 */
function hasPermission(module, action) {
  return async (req, res, next) => {
    try {
      const { id, role } = req.user;
      
      // Super admin bypass
      if (role === 'super_admin') return next();

      const field = `can_${action}`;

      // 1) Check per-user permission first
      const userPerm = await db('user_permissions')
        .where({ user_id: id, module })
        .first();

      if (userPerm) {
        if (userPerm[field]) return next();
        throw AppError.forbidden('ليس لديك صلاحية للقيام بهذه العملية');
      }

      // 2) Fallback to role-based permission
      const rolePerm = await db('role_permissions')
        .where({ role, module })
        .first();

      if (rolePerm && rolePerm[field]) return next();

      throw AppError.forbidden('ليس لديك صلاحية للقيام بهذه العملية');
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authenticate, authorize, ownDoctorOnly, hasPermission };
