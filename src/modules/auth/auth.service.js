// src/modules/auth/auth.service.js
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { db }  = require('../../db/knex');
const AppError = require('../../utils/AppError');
const { logAudit } = require('../../middleware/audit');

// ─────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────

function generateAccessToken(userId, role) {
  return jwt.sign(
    { sub: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

async function generateRefreshToken(userId, req) {
  const raw   = crypto.randomBytes(64).toString('hex');
  const hash  = crypto.createHash('sha256').update(raw).digest('hex');
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30); // 30 days

  await db('refresh_tokens').insert({
    user_id:     userId,
    token_hash:  hash,
    device_info: req.get('user-agent') || null,
    ip_address:  req.ip || null,
    expires_at:  expiry,
  });

  return raw; // Return raw token to client (hash stored in DB)
}

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────

async function login({ email, password }, req) {
  const user = await db('users')
    .where({ email })
    .select('id', 'email', 'password_hash', 'role', 'full_name', 'branch_id', 'is_active')
    .first();

  if (!user) throw AppError.unauthorized('Invalid email or password');
  if (!user.is_active) throw AppError.unauthorized('Account is deactivated');

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) throw AppError.unauthorized('Invalid email or password');

  // Update last login
  await db('users').where({ id: user.id }).update({ last_login: new Date() });

  const accessToken  = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id, req);

  await logAudit({ userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id, req });

  return {
    access_token:  accessToken,
    refresh_token: refreshToken,
    token_type:    'Bearer',
    expires_in:    15 * 60, // seconds
    user: {
      id:        user.id,
      email:     user.email,
      full_name: user.full_name,
      role:      user.role,
      branch_id: user.branch_id,
    },
  };
}

// ─────────────────────────────────────────────
// Refresh tokens
// ─────────────────────────────────────────────

async function refreshTokens(rawToken, req) {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const stored = await db('refresh_tokens')
    .where({ token_hash: hash })
    .whereNull('revoked_at')
    .where('expires_at', '>', new Date())
    .first();

  if (!stored) throw AppError.unauthorized('Invalid or expired refresh token');

  const user = await db('users')
    .where({ id: stored.user_id, is_active: true })
    .select('id', 'role', 'full_name', 'email', 'branch_id')
    .first();

  if (!user) throw AppError.unauthorized('User not found');

  // Rotate: revoke old token, issue new pair
  await db('refresh_tokens').where({ id: stored.id }).update({ revoked_at: new Date() });

  const accessToken     = generateAccessToken(user.id, user.role);
  const newRefreshToken = await generateRefreshToken(user.id, req);

  return {
    access_token:  accessToken,
    refresh_token: newRefreshToken,
    token_type:    'Bearer',
    expires_in:    15 * 60,
    user: {
      id:        user.id,
      email:     user.email,
      full_name: user.full_name,
      role:      user.role,
      branch_id: user.branch_id,
    },
  };
}

// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────

async function logout(rawToken, userId, req) {
  if (rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db('refresh_tokens').where({ token_hash: hash }).update({ revoked_at: new Date() });
  }
  await logAudit({ userId, action: 'LOGOUT', entityType: 'user', entityId: userId, req });
}

// ─────────────────────────────────────────────
// Create user (Admin only)
// ─────────────────────────────────────────────

async function createUser(data, adminUser) {
  const existing = await db('users').where({ email: data.email }).first();
  if (existing) throw AppError.conflict('Email already in use', 'DUPLICATE_EMAIL');

  const passwordHash = await bcrypt.hash(data.password, 12);

  const [user] = await db('users')
    .insert({
      email:        data.email,
      password_hash: passwordHash,
      role:          data.role,
      full_name:     data.full_name,
      full_name_ar:  data.full_name_ar || null,
      phone:         data.phone || null,
      national_id:   data.national_id || null,
      branch_id:     data.branch_id,
    })
    .returning(['id', 'email', 'role', 'full_name', 'branch_id', 'created_at']);

  await logAudit({
    userId:     adminUser.id,
    action:     'CREATE',
    entityType: 'user',
    entityId:   user.id,
    newValues:  { email: user.email, role: user.role },
  });

  return user;
}

// ─────────────────────────────────────────────
// Change password
// ─────────────────────────────────────────────

async function changePassword({ old_password, new_password }, userId) {
  const user = await db('users').where({ id: userId }).select('password_hash').first();
  if (!user) throw AppError.notFound('User');

  const match = await bcrypt.compare(old_password, user.password_hash);
  if (!match) throw AppError.badRequest('Old password is incorrect');

  const newHash = await bcrypt.hash(new_password, 12);
  await db('users').where({ id: userId }).update({ password_hash: newHash });

  // Revoke all refresh tokens on password change (force re-login everywhere)
  await db('refresh_tokens').where({ user_id: userId }).update({ revoked_at: new Date() });
}

module.exports = { login, refreshTokens, logout, createUser, changePassword };
