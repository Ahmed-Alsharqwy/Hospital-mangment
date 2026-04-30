// src/modules/nurses/nurses.service.js
const bcrypt    = require('bcryptjs');
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');
const { logAudit } = require('../../middleware/audit');

async function listNurses(queryParams, user) {
  const { page, limit, search, branch_id, department_id, shift } = queryParams;

  let query = db('nurses as n')
    .join('users as u',          'n.user_id',       'u.id')
    .join('branches as b',       'u.branch_id',     'b.id')
    .leftJoin('departments as d', 'n.department_id', 'd.id')
    .where('u.is_active', true)
    .select(
      'n.id', 'n.shift', 'n.license_number', 'n.qualification',
      'u.id as user_id', 'u.full_name', 'u.full_name_ar',
      'u.phone', 'u.email', 'u.avatar_url',
      'b.id as branch_id', 'b.name as branch_name',
      'd.id as department_id', 'd.name as department_name'
    )
    .orderBy('u.full_name', 'asc');

  if (user.role !== 'super_admin') {
    query = query.where('u.branch_id', user.branch_id);
  } else if (branch_id) {
    query = query.where('u.branch_id', branch_id);
  }

  if (department_id) query = query.where('n.department_id', department_id);
  if (shift)         query = query.where('n.shift', shift);

  if (search) {
    const term = `%${search}%`;
    query = query.where(q => q.whereILike('u.full_name', term).orWhereILike('n.license_number', term));
  }

  const { count } = await query.clone().clearSelect().clearOrder().count('n.id as count').first();
  const { query: pq, page: pg, limit: lm } = paginate(query, { page, limit });
  const nurses = await pq;

  return { nurses, total: parseInt(count), page: pg, limit: lm };
}

async function getNurse(nurseId, user) {
  const nurse = await db('nurses as n')
    .join('users as u', 'n.user_id', 'u.id')
    .join('branches as b', 'u.branch_id', 'b.id')
    .leftJoin('departments as d', 'n.department_id', 'd.id')
    .where('n.id', nurseId)
    .select('n.*', 'u.full_name', 'u.email', 'u.phone', 'u.is_active',
            'b.id as branch_id', 'b.name as branch_name', 'd.name as department_name')
    .first();

  if (!nurse) throw AppError.notFound('Nurse');

  if (user.role !== 'super_admin' && nurse.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  return nurse;
}

async function createNurse(data, adminUser) {
  const existing = await db('users').where({ email: data.email }).first();
  if (existing) throw AppError.conflict('Email already in use', 'DUPLICATE_EMAIL');

  const passwordHash = await bcrypt.hash(data.password, 12);

  return await db.transaction(async (trx) => {
    const [user] = await trx('users')
      .insert({
        email:         data.email,
        password_hash: passwordHash,
        role:          'nurse',
        full_name:     data.full_name,
        full_name_ar:  data.full_name_ar || null,
        phone:         data.phone || null,
        national_id:   data.national_id || null,
        branch_id:     data.branch_id,
      })
      .returning(['id', 'full_name', 'email', 'branch_id']);

    const [nurse] = await trx('nurses')
      .insert({
        user_id:        user.id,
        department_id:  data.department_id || null,
        license_number: data.license_number || null,
        shift:          data.shift || 'morning',
        qualification:  data.qualification || null,
      })
      .returning('*');

    await logAudit({
      userId: adminUser.id, action: 'CREATE',
      entityType: 'nurse', entityId: nurse.id,
      newValues: { email: user.email, shift: nurse.shift },
    });

    return { ...nurse, user };
  });
}

async function updateNurse(nurseId, data, adminUser) {
  const existing = await db('nurses as n')
    .join('users as u', 'n.user_id', 'u.id')
    .where('n.id', nurseId)
    .select('n.*', 'u.id as user_id', 'u.branch_id')
    .first();

  if (!existing) throw AppError.notFound('Nurse');

  if (adminUser.role !== 'super_admin' && existing.branch_id !== adminUser.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  return await db.transaction(async (trx) => {
    const userKeys  = ['full_name', 'full_name_ar', 'phone', 'is_active'];
    const nurseKeys = ['department_id', 'shift', 'qualification'];
    const userFields  = {};
    const nurseFields = {};

    for (const [k, v] of Object.entries(data)) {
      if (userKeys.includes(k))  userFields[k]  = v;
      if (nurseKeys.includes(k)) nurseFields[k] = v;
    }

    if (Object.keys(userFields).length)  await trx('users').where({ id: existing.user_id }).update(userFields);
    if (Object.keys(nurseFields).length) await trx('nurses').where({ id: nurseId }).update({ ...nurseFields, updated_at: new Date() });

    await logAudit({
      userId: adminUser.id, action: 'UPDATE',
      entityType: 'nurse', entityId: nurseId,
      oldValues: existing, newValues: data,
    });

    return await trx('nurses as n')
      .join('users as u', 'n.user_id', 'u.id')
      .where('n.id', nurseId)
      .select('n.*', 'u.full_name', 'u.email', 'u.phone', 'u.is_active')
      .first();
  });
}

module.exports = { listNurses, getNurse, createNurse, updateNurse };
