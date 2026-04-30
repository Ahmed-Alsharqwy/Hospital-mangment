// src/modules/appointments/appointments.service.js
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');
const { logAudit } = require('../../middleware/audit');

// ─────────────────────────────────────────────
// Status transition rules (state machine)
// ─────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
  scheduled:   ['confirmed', 'cancelled', 'no_show'],
  confirmed:   ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

function validateTransition(current, next) {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed) throw AppError.badRequest(`Unknown status: ${current}`);
  if (!allowed.includes(next)) {
    throw AppError.badRequest(
      `Cannot transition from '${current}' to '${next}'. Allowed: ${allowed.join(', ') || 'none'}`,
      'INVALID_STATUS_TRANSITION'
    );
  }
}

// ─────────────────────────────────────────────
// Conflict detection
// ─────────────────────────────────────────────

async function checkConflict(doctorId, scheduledAt, durationMinutes, excludeId = null) {
  const start = new Date(scheduledAt);
  const end   = new Date(start.getTime() + durationMinutes * 60 * 1000);

  let query = db('appointments')
    .where('doctor_id', doctorId)
    .whereNotIn('status', ['cancelled', 'no_show'])
    .where(function () {
      // Overlap condition: existing.start < new.end AND existing.end > new.start
      this.whereRaw('scheduled_at < ?', [end])
          .whereRaw("scheduled_at + (duration_minutes || ' minutes')::interval > ?", [start]);
    });

  if (excludeId) query = query.whereNot('id', excludeId);

  const conflict = await query.first();

  if (conflict) {
    throw AppError.conflict(
      `Doctor already has an appointment from ${conflict.scheduled_at} (${conflict.duration_minutes} min). ` +
      `Please choose a different time.`,
      'APPOINTMENT_CONFLICT'
    );
  }
}

// ─────────────────────────────────────────────
// Check doctor availability (day + capacity)
// ─────────────────────────────────────────────

async function checkDoctorAvailability(doctorId, scheduledAt) {
  const doctor = await db('doctors').where({ id: doctorId }).first();
  if (!doctor) throw AppError.notFound('Doctor');

  const date = new Date(scheduledAt);
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayName = days[date.getDay()];

  // Check if the doctor works on this day
  if (doctor.available_days.length > 0 && !doctor.available_days.includes(dayName)) {
    throw AppError.badRequest(
      `Doctor is not available on ${dayName}. Available days: ${doctor.available_days.join(', ')}`,
      'DOCTOR_NOT_AVAILABLE'
    );
  }

  // Check daily capacity
  const { count } = await db('appointments')
    .where('doctor_id', doctorId)
    .whereRaw("DATE(scheduled_at) = ?", [date.toISOString().split('T')[0]])
    .whereNotIn('status', ['cancelled', 'no_show'])
    .count('id as count')
    .first();

  if (parseInt(count) >= doctor.max_daily_patients) {
    throw AppError.conflict(
      `Doctor has reached daily patient limit (${doctor.max_daily_patients})`,
      'DOCTOR_FULLY_BOOKED'
    );
  }
}

// ─────────────────────────────────────────────
// Notify via Socket.io
// ─────────────────────────────────────────────

async function notifyUser(io, userId, notification) {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification', notification);
}

// ─────────────────────────────────────────────
// List appointments
// ─────────────────────────────────────────────

async function listAppointments(queryParams, user) {
  const { page, limit, doctor_id, patient_id, status, type, date_from, date_to, branch_id } = queryParams;

  let query = db('appointments as a')
    .join('patients as p',  'a.patient_id', 'p.id')
    .join('doctors as d',   'a.doctor_id',  'd.id')
    .join('users as u',     'd.user_id',    'u.id')
    .join('branches as b',  'a.branch_id',  'b.id')
    .leftJoin('departments as dept', 'd.department_id', 'dept.id')
    .select(
      'a.id', 'a.scheduled_at', 'a.duration_minutes', 'a.status',
      'a.type', 'a.chief_complaint', 'a.notes', 'a.created_at',
      'p.id as patient_id', 'p.mrn', 'p.full_name as patient_name', 'p.phone as patient_phone',
      'd.id as doctor_id', 'u.full_name as doctor_name', 'd.specialization',
      'b.id as branch_id', 'b.name as branch_name',
      'dept.name as department_name'
    )
    .orderBy('a.scheduled_at', 'asc');

  // Role-based scoping
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    if (doc) query = query.where('a.doctor_id', doc.id);
  } else if (user.role !== 'super_admin') {
    query = query.where('a.branch_id', user.branch_id);
  }

  if (doctor_id)  query = query.where('a.doctor_id',  doctor_id);
  if (patient_id) query = query.where('a.patient_id', patient_id);
  if (status)     query = query.where('a.status',     status);
  if (type)       query = query.where('a.type',       type);
  if (branch_id && user.role === 'super_admin') query = query.where('a.branch_id', branch_id);
  if (date_from)  query = query.where('a.scheduled_at', '>=', date_from);
  if (date_to)    query = query.where('a.scheduled_at', '<=', date_to);

  const { count } = await query.clone().clearSelect().clearOrder().count('a.id as count').first();
  const { query: pq, page: pg, limit: lm } = paginate(query, { page, limit });
  const appointments = await pq;

  return { appointments, total: parseInt(count), page: pg, limit: lm };
}

// ─────────────────────────────────────────────
// Get single appointment
// ─────────────────────────────────────────────

async function getAppointment(id, user) {
  const appt = await db('appointments as a')
    .join('patients as p', 'a.patient_id', 'p.id')
    .join('doctors as d',  'a.doctor_id',  'd.id')
    .join('users as u',    'd.user_id',    'u.id')
    .join('branches as b', 'a.branch_id',  'b.id')
    .where('a.id', id)
    .select('a.*', 'p.full_name as patient_name', 'p.mrn', 'p.phone as patient_phone',
            'u.full_name as doctor_name', 'd.specialization', 'b.name as branch_name')
    .first();

  if (!appt) throw AppError.notFound('Appointment');

  if (user.role !== 'super_admin' && appt.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  return appt;
}

// ─────────────────────────────────────────────
// Create appointment
// ─────────────────────────────────────────────

async function createAppointment(data, user, io) {
  // Validate patient + doctor exist and are in same branch
  const patient = await db('patients').where({ id: data.patient_id }).first();
  if (!patient) throw AppError.notFound('Patient');

  const doctor = await db('doctors as d')
    .join('users as u', 'd.user_id', 'u.id')
    .where('d.id', data.doctor_id)
    .select('d.id', 'u.id as user_id', 'u.branch_id')
    .first();
  if (!doctor) throw AppError.notFound('Doctor');

  // Conflict + availability checks
  await checkDoctorAvailability(data.doctor_id, data.scheduled_at);
  await checkConflict(data.doctor_id, data.scheduled_at, data.duration_minutes || 30);

  const [appointment] = await db('appointments')
    .insert({
      patient_id:       data.patient_id,
      doctor_id:        data.doctor_id,
      branch_id:        patient.branch_id,
      scheduled_at:     data.scheduled_at,
      duration_minutes: data.duration_minutes || 30,
      type:             data.type || 'consultation',
      chief_complaint:  data.chief_complaint || null,
      notes:            data.notes || null,
      created_by:       user.id,
    })
    .returning('*');

  // Save notification in DB
  const notifData = {
    user_id:     doctor.user_id,
    type:        'appointment_reminder',
    title:       'New Appointment',
    message:     `New appointment scheduled on ${new Date(appointment.scheduled_at).toLocaleString()}`,
    entity_type: 'appointment',
    entity_id:   appointment.id,
  };
  await db('notifications').insert(notifData);

  // Push real-time notification to doctor
  await notifyUser(io, doctor.user_id, notifData);

  await logAudit({
    userId: user.id, action: 'CREATE',
    entityType: 'appointment', entityId: appointment.id,
    newValues: { patient_id: data.patient_id, doctor_id: data.doctor_id, scheduled_at: data.scheduled_at },
  });

  return appointment;
}

// ─────────────────────────────────────────────
// Update appointment (reschedule)
// ─────────────────────────────────────────────

async function updateAppointment(id, data, user) {
  const existing = await db('appointments').where({ id }).first();
  if (!existing) throw AppError.notFound('Appointment');

  // Branch isolation
  if (user.role !== 'super_admin' && existing.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  if (!['scheduled', 'confirmed'].includes(existing.status)) {
    throw AppError.badRequest('Only scheduled or confirmed appointments can be modified');
  }

  if (data.scheduled_at) {
    await checkDoctorAvailability(existing.doctor_id, data.scheduled_at);
    await checkConflict(
      existing.doctor_id,
      data.scheduled_at,
      data.duration_minutes || existing.duration_minutes,
      id
    );
  }

  const [updated] = await db('appointments')
    .where({ id })
    .update({ ...data, updated_by: user.id, updated_at: new Date() })
    .returning('*');

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'appointment', entityId: id,
    oldValues: existing, newValues: data,
  });

  return updated;
}

// ─────────────────────────────────────────────
// Update appointment status (state machine)
// ─────────────────────────────────────────────

async function updateStatus(id, { status, cancel_reason }, user, io) {
  const existing = await db('appointments').where({ id }).first();
  if (!existing) throw AppError.notFound('Appointment');

  // Branch isolation
  if (user.role !== 'super_admin' && existing.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  // Enforce state machine
  validateTransition(existing.status, status);

  const updateData = {
    status,
    updated_by:    user.id,
    updated_at:    new Date(),
    cancel_reason: cancel_reason || null,
  };

  const [updated] = await db('appointments')
    .where({ id })
    .update(updateData)
    .returning('*');

  // Notify patient's doctor + relevant staff
  const doctor = await db('doctors as d')
    .join('users as u', 'd.user_id', 'u.id')
    .where('d.id', existing.doctor_id)
    .select('u.id as user_id')
    .first();

  if (doctor) {
    const notifData = {
      user_id:     doctor.user_id,
      type:        'appointment_update',
      title:       `Appointment ${status}`,
      message:     `Appointment status changed to: ${status}`,
      entity_type: 'appointment',
      entity_id:   id,
    };
    await db('notifications').insert(notifData);
    await notifyUser(io, doctor.user_id, notifData);
  }

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'appointment', entityId: id,
    oldValues: { status: existing.status },
    newValues: { status },
  });

  return updated;
}

// ─────────────────────────────────────────────
// Today's overview (for dashboard)
// ─────────────────────────────────────────────

async function getTodayOverview(user) {
  const branchFilter = user.role !== 'super_admin' ? { 'a.branch_id': user.branch_id } : {};

  const stats = await db('appointments as a')
    .where(branchFilter)
    .whereRaw("DATE(a.scheduled_at) = CURRENT_DATE")
    .select(
      db.raw("COUNT(*) AS total"),
      db.raw("COUNT(*) FILTER (WHERE status = 'scheduled')   AS scheduled"),
      db.raw("COUNT(*) FILTER (WHERE status = 'confirmed')   AS confirmed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress"),
      db.raw("COUNT(*) FILTER (WHERE status = 'completed')   AS completed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled"),
      db.raw("COUNT(*) FILTER (WHERE status = 'no_show')     AS no_show")
    )
    .first();

  return stats;
}

module.exports = {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  updateStatus,
  getTodayOverview,
};
