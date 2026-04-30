const { db } = require('../../db/knex');
const { ok, created } = require('../../utils/response');
const bcrypt = require('bcryptjs');

// List all users with their individual permissions
async function listUsers(req, res) {
  const users = await db('users')
    .where('is_active', true)
    .select('id', 'full_name', 'full_name_ar', 'email', 'role', 'phone', 'is_active', 'last_login', 'created_at')
    .orderBy('role')
    .orderBy('full_name');

  // Get all permissions grouped by user
  const perms = await db('user_permissions').orderBy('module');

  const result = users.map(u => ({
    ...u,
    permissions: perms.filter(p => p.user_id === u.id)
  }));

  ok(res, result);
}

// Update a single user's permission for a specific module
async function updateUserPermission(req, res) {
  const { userId } = req.params;
  const { module, can_view, can_create, can_edit, can_delete } = req.body;

  const existing = await db('user_permissions')
    .where({ user_id: userId, module })
    .first();

  if (existing) {
    const updates = {};
    if (can_view !== undefined)   updates.can_view   = can_view;
    if (can_create !== undefined) updates.can_create = can_create;
    if (can_edit !== undefined)   updates.can_edit   = can_edit;
    if (can_delete !== undefined) updates.can_delete = can_delete;

    await db('user_permissions')
      .where({ user_id: userId, module })
      .update(updates);
  } else {
    await db('user_permissions').insert({
      user_id: userId,
      module,
      can_view:   can_view   || false,
      can_create: can_create || false,
      can_edit:   can_edit   || false,
      can_delete: can_delete || false,
    });
  }

  ok(res, null, 'Permission updated');
}

// Create a new staff user
async function createUser(req, res) {
  const { full_name, email, password, role, phone } = req.body;

  // Check if email exists
  const exists = await db('users').where({ email }).first();
  if (exists) {
    return res.status(400).json({ status: 'error', message: 'البريد الإلكتروني مستخدم بالفعل' });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const [user] = await db('users')
    .insert({
      branch_id: req.user.branch_id,
      full_name,
      email,
      password_hash,
      role,
      phone: phone || null,
    })
    .returning(['id', 'full_name', 'email', 'role', 'phone', 'created_at']);

  // Seed default permissions for this new user
  const modules = ['patients', 'appointments', 'billing', 'reports', 'settings', 'records'];
  const isAdmin = role === 'admin';
  const permRows = modules.map(m => ({
    user_id: user.id,
    module: m,
    can_view:   isAdmin || role === 'doctor',
    can_create: isAdmin,
    can_edit:   isAdmin,
    can_delete: false,
  }));
  await db('user_permissions').insert(permRows);

  created(res, user, 'User created successfully');
}

// Toggle user active status
async function toggleUserActive(req, res) {
  const { userId } = req.params;
  const user = await db('users').where({ id: userId }).first();
  if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

  await db('users').where({ id: userId }).update({ is_active: !user.is_active });
  ok(res, { is_active: !user.is_active }, user.is_active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
}

module.exports = { listUsers, updateUserPermission, createUser, toggleUserActive };
