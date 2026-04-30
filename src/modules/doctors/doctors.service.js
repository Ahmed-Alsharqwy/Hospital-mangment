// src/modules/doctors/doctors.service.js
const bcrypt    = require('bcryptjs');
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');
const { logAudit } = require('../../middleware/audit');

// ─────────────────────────────────────────────
// List doctors
// ─────────────────────────────────────────────

async function listDoctors(queryParams, user) {
  const { page, limit, search, branch_id, department_id, specialization, available_day } = queryParams;

  let query = db('doctors as d')
    .join('users as u',          'd.user_id',       'u.id')
    .join('branches as b',       'u.branch_id',     'b.id')
    .leftJoin('departments as dept', 'd.department_id', 'dept.id')
    .where('u.is_active', true)
    .select(
      'd.id', 'd.specialization', 'd.license_number',
      'd.consultation_fee', 'd.available_days',
      'd.work_start_time', 'd.work_end_time', 'd.max_daily_patients',
      'd.bio', 'd.qualification',
      'u.id as user_id', 'u.full_name', 'u.full_name_ar',
      'u.phone', 'u.email', 'u.avatar_url',
      'b.id as branch_id', 'b.name as branch_name',
      'dept.id as department_id', 'dept.name as department_name'
    )
    .orderBy('u.full_name', 'asc');

  // Scope to branch
  if (user.role !== 'super_admin') {
    query = query.where('u.branch_id', user.branch_id);
  } else if (branch_id) {
    query = query.where('u.branch_id', branch_id);
  }

  if (department_id)  query = query.where('d.department_id', department_id);
  if (specialization) query = query.whereILike('d.specialization', `%${specialization}%`);

  // Filter by available day (PostgreSQL array contains)
  if (available_day) {
    query = query.whereRaw('? = ANY(d.available_days)', [available_day]);
  }

  if (search) {
    const term = `%${search}%`;
    query = query.where(function () {
      this.whereILike('u.full_name', term)
          .orWhereILike('d.specialization', term)
          .orWhereILike('d.license_number', term);
    });
  }

  const countQuery = query.clone().clearSelect().clearOrder().count('d.id as count').first();
  const { count }  = await countQuery;
  const { query: pq, page: pg, limit: lm } = paginate(query, { page, limit });
  const doctors = await pq;

  return { doctors, total: parseInt(count), page: pg, limit: lm };
}

// ─────────────────────────────────────────────
// Get single doctor with stats
// ─────────────────────────────────────────────

async function getDoctor(doctorId, user) {
  const doctor = await db('doctors as d')
    .join('users as u', 'd.user_id', 'u.id')
    .join('branches as b', 'u.branch_id', 'b.id')
    .leftJoin('departments as dept', 'd.department_id', 'dept.id')
    .where('d.id', doctorId)
    .select(
      'd.*',
      'u.full_name', 'u.full_name_ar', 'u.email', 'u.phone',
      'u.avatar_url', 'u.is_active', 'u.last_login',
      'b.id as branch_id', 'b.name as branch_name',
      'dept.name as department_name'
    )
    .first();

  if (!doctor) throw AppError.notFound('Doctor');

  if (user.role !== 'super_admin' && doctor.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  // Fetch today's appointments count
  const todayStats = await db('appointments')
    .where('doctor_id', doctorId)
    .whereRaw("DATE(scheduled_at) = CURRENT_DATE")
    .count('id as count')
    .first();

  // Fetch overall stats
  const totalStats = await db('appointments')
    .where('doctor_id', doctorId)
    .select(
      db.raw("COUNT(*) FILTER (WHERE status = 'completed') AS completed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'scheduled' OR status = 'confirmed') AS upcoming"),
      db.raw("COUNT(DISTINCT patient_id) AS total_patients")
    )
    .first();

  return {
    ...doctor,
    stats: {
      today_appointments: parseInt(todayStats.count),
      total_completed:    parseInt(totalStats.completed),
      upcoming:           parseInt(totalStats.upcoming),
      total_patients:     parseInt(totalStats.total_patients),
    }
  };
}

// ─────────────────────────────────────────────
// Create doctor (creates user + doctor profile atomically)
// ─────────────────────────────────────────────

async function createDoctor(data, adminUser) {
  const existing = await db('users').where({ email: data.email }).first();
  if (existing) throw AppError.conflict('Email already in use', 'DUPLICATE_EMAIL');

  const licenseExists = await db('doctors').where({ license_number: data.license_number }).first();
  if (licenseExists) throw AppError.conflict('License number already registered', 'DUPLICATE_LICENSE');

  const passwordHash = await bcrypt.hash(data.password, 12);

  return await db.transaction(async (trx) => {
    const [user] = await trx('users')
      .insert({
        email:         data.email,
        password_hash: passwordHash,
        role:          'doctor',
        full_name:     data.full_name,
        full_name_ar:  data.full_name_ar || null,
        phone:         data.phone || null,
        national_id:   data.national_id || null,
        branch_id:     data.branch_id,
      })
      .returning(['id', 'full_name', 'email', 'branch_id']);

    const [doctor] = await trx('doctors')
      .insert({
        user_id:            user.id,
        department_id:      data.department_id || null,
        specialization:     data.specialization,
        license_number:     data.license_number,
        qualification:      data.qualification || null,
        consultation_fee:   data.consultation_fee || 0,
        bio:                data.bio || null,
        available_days:     data.available_days || [],
        work_start_time:    data.work_start_time || null,
        work_end_time:      data.work_end_time || null,
        max_daily_patients: data.max_daily_patients || 20,
      })
      .returning('*');

    await logAudit({
      userId:     adminUser.id,
      action:     'CREATE',
      entityType: 'doctor',
      entityId:   doctor.id,
      newValues:  { email: user.email, specialization: doctor.specialization },
    });

    return { ...doctor, user };
  });
}

// ─────────────────────────────────────────────
// Update doctor
// ─────────────────────────────────────────────

async function updateDoctor(doctorId, data, adminUser) {
  const existing = await db('doctors as d')
    .join('users as u', 'd.user_id', 'u.id')
    .where('d.id', doctorId)
    .select('d.*', 'u.id as user_id', 'u.branch_id')
    .first();

  if (!existing) throw AppError.notFound('Doctor');

  if (adminUser.role !== 'super_admin' && existing.branch_id !== adminUser.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  return await db.transaction(async (trx) => {
    // Separate user fields from doctor fields
    const userFields   = {};
    const doctorFields = {};

    const userKeys   = ['full_name', 'full_name_ar', 'phone', 'is_active'];
    const doctorKeys = [
      'department_id', 'specialization', 'qualification', 'consultation_fee',
      'bio', 'available_days', 'work_start_time', 'work_end_time', 'max_daily_patients'
    ];

    for (const [key, val] of Object.entries(data)) {
      if (userKeys.includes(key))   userFields[key]   = val;
      if (doctorKeys.includes(key)) doctorFields[key] = val;
    }

    if (Object.keys(userFields).length > 0) {
      await trx('users').where({ id: existing.user_id }).update(userFields);
    }

    let updatedDoctor = existing;
    if (Object.keys(doctorFields).length > 0) {
      [updatedDoctor] = await trx('doctors')
        .where({ id: doctorId })
        .update({ ...doctorFields, updated_at: new Date() })
        .returning('*');
    }

    await logAudit({
      userId: adminUser.id, action: 'UPDATE',
      entityType: 'doctor', entityId: doctorId,
      oldValues: existing, newValues: data,
    });

    return updatedDoctor;
  });
}

// ─────────────────────────────────────────────
// Get doctor's schedule for a specific date
// ─────────────────────────────────────────────

async function getDoctorSchedule(doctorId, date) {
  const doctor = await db('doctors').where({ id: doctorId }).first();
  if (!doctor) throw AppError.notFound('Doctor');

  const appointments = await db('appointments as a')
    .join('patients as p', 'a.patient_id', 'p.id')
    .where('a.doctor_id', doctorId)
    .whereRaw("DATE(a.scheduled_at) = ?", [date])
    .whereNotIn('a.status', ['cancelled'])
    .select(
      'a.id', 'a.scheduled_at', 'a.duration_minutes', 'a.status', 'a.type',
      'p.id as patient_id', 'p.full_name as patient_name', 'p.mrn', 'p.phone'
    )
    .orderBy('a.scheduled_at', 'asc');

  return {
    doctor_id:          doctorId,
    date,
    max_daily_patients: doctor.max_daily_patients,
    booked_count:       appointments.length,
    slots_remaining:    Math.max(0, doctor.max_daily_patients - appointments.length),
    appointments,
  };
}

module.exports = { listDoctors, getDoctor, createDoctor, updateDoctor, getDoctorSchedule };
