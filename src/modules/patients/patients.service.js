// src/modules/patients/patients.service.js
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');
const { logAudit } = require('../../middleware/audit');

// ─────────────────────────────────────────────
// Generate MRN
// ─────────────────────────────────────────────

async function generateMRN() {
  const result = await db.raw("SELECT generate_mrn() AS mrn");
  return result.rows[0].mrn;
}

// ─────────────────────────────────────────────
// List patients (with search + filters)
// ─────────────────────────────────────────────

async function listPatients(queryParams, user) {
  const { page, limit, search, branch_id, gender, blood_type, status } = queryParams;

  let query = db('patients as p')
    .join('branches as b', 'p.branch_id', 'b.id')
    .select(
      'p.id', 'p.mrn', 'p.full_name', 'p.full_name_ar',
      'p.date_of_birth', 'p.gender', 'p.blood_type', 'p.status',
      'p.phone', 'p.email', 'p.allergies', 'p.chronic_conditions',
      'p.insurance_provider', 'p.created_at',
      'b.name as branch_name',
      db.raw("EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age")
    )
    .orderBy('p.created_at', 'desc');

  // Branch restriction: non-admins see only their branch
  if (user.role !== 'super_admin') {
    query = query.where('p.branch_id', user.branch_id);
  } else if (branch_id) {
    query = query.where('p.branch_id', branch_id);
  }

  if (gender)     query = query.where('p.gender', gender);
  if (blood_type) query = query.where('p.blood_type', blood_type);
  if (status)     query = query.where('p.status', status);

  if (search) {
    const term = `%${search}%`;
    query = query.where(function () {
      this.whereILike('p.full_name', term)
          .orWhereILike('p.phone', term)
          .orWhereILike('p.mrn', term)
          .orWhereILike('p.national_id', term);
    });
  }

  // Count total before applying pagination
  const countQuery = query.clone().clearSelect().clearOrder().count('p.id as count').first();
  const { count } = await countQuery;

  const { query: paginatedQuery, page: pg, limit: lm } = paginate(query, { page, limit });
  const patients = await paginatedQuery;

  return { patients, total: parseInt(count), page: pg, limit: lm };
}

// ─────────────────────────────────────────────
// Get single patient with full details
// ─────────────────────────────────────────────

async function getPatient(patientId, user) {
  const patient = await db('patients as p')
    .join('branches as b', 'p.branch_id', 'b.id')
    .leftJoin('users as u', 'p.created_by', 'u.id')
    .where('p.id', patientId)
    .select(
      'p.*',
      'b.name as branch_name',
      'u.full_name as registered_by',
      db.raw("EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age")
    )
    .first();

  if (!patient) throw AppError.notFound('Patient');

  // Branch restriction
  if (user.role !== 'super_admin' && patient.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  // Remove sensitive internal fields before returning
  const { password_hash, ...safe } = patient;

  // Fetch last 5 appointments summary
  const recentAppointments = await db('appointments as a')
    .join('doctors as d', 'a.doctor_id', 'd.id')
    .join('users as u', 'd.user_id', 'u.id')
    .where('a.patient_id', patientId)
    .select('a.id', 'a.scheduled_at', 'a.status', 'a.type', 'u.full_name as doctor_name')
    .orderBy('a.scheduled_at', 'desc')
    .limit(5);

  return { ...safe, recent_appointments: recentAppointments };
}

// ─────────────────────────────────────────────
// Create patient
// ─────────────────────────────────────────────

async function createPatient(data, user) {
  // Check for duplicate national_id within branch
  if (data.national_id) {
    const existing = await db('patients')
      .where({ national_id: data.national_id, branch_id: user.branch_id })
      .first();
    if (existing) throw AppError.conflict('A patient with this national ID already exists', 'DUPLICATE_NATIONAL_ID');
  }

  const mrn = await generateMRN();

  const [patient] = await db('patients')
    .insert({
      ...data,
      mrn,
      branch_id:  user.branch_id,
      created_by: user.id,
    })
    .returning('*');

  await logAudit({
    userId: user.id, action: 'CREATE',
    entityType: 'patient', entityId: patient.id,
    newValues: { mrn: patient.mrn, full_name: patient.full_name },
  });

  return patient;
}

// ─────────────────────────────────────────────
// Update patient
// ─────────────────────────────────────────────

async function updatePatient(patientId, data, user) {
  const existing = await db('patients').where({ id: patientId }).first();
  if (!existing) throw AppError.notFound('Patient');

  if (user.role !== 'super_admin' && existing.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  const [updated] = await db('patients')
    .where({ id: patientId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'patient', entityId: patientId,
    oldValues: existing, newValues: data,
  });

  return updated;
}

// ─────────────────────────────────────────────
// Delete patient (soft — just flag, hard only for super_admin)
// ─────────────────────────────────────────────

async function deletePatient(patientId, user) {
  const existing = await db('patients').where({ id: patientId }).first();
  if (!existing) throw AppError.notFound('Patient');

  if (user.role !== 'super_admin') throw AppError.forbidden('Only super admins can delete patients');

  // Hard delete — cascade will remove related records
  await db('patients').where({ id: patientId }).delete();

  await logAudit({
    userId: user.id, action: 'DELETE',
    entityType: 'patient', entityId: patientId,
    oldValues: { mrn: existing.mrn, full_name: existing.full_name },
  });
}

async function getPatientTimeline(patientId, user) {
  await getPatient(patientId, user);
  return db('medical_records as mr')
    .join('doctors as d', 'mr.doctor_id', 'd.id')
    .join('users as u', 'd.user_id', 'u.id')
    .where('mr.patient_id', patientId)
    .select('mr.*', 'u.full_name as doctor_name', 'd.specialization')
    .orderBy('mr.visit_date', 'desc');
}

async function getPatientFullHistory(patientId, user) {
  console.log('[DEBUG] getPatientFullHistory started for', patientId);
  const patient = await getPatient(patientId, user);
  console.log('[DEBUG] Patient found');

  const [records, diagnoses, prescriptions, vitals, attachments] = await Promise.all([
    db('medical_records as mr')
      .join('doctors as d', 'mr.doctor_id', 'd.id')
      .join('users as u', 'd.user_id', 'u.id')
      .where('mr.patient_id', patientId)
      .select('mr.*', 'u.full_name as doctor_name', 'd.specialization')
      .orderBy('mr.visit_date', 'desc'),
    
    db('diagnoses as dg')
      .join('medical_records as mr', 'dg.medical_record_id', 'mr.id')
      .where('mr.patient_id', patientId)
      .select('dg.*', 'mr.visit_date')
      .orderBy('dg.created_at', 'desc'),

    db('prescriptions as rx')
      .join('medical_records as mr', 'rx.medical_record_id', 'mr.id')
      .join('doctors as d', 'rx.doctor_id', 'd.id')
      .join('users as u', 'd.user_id', 'u.id')
      .where('rx.patient_id', patientId)
      .select('rx.*', 'u.full_name as doctor_name')
      .orderBy('rx.issued_at', 'desc'),

    db('vital_signs as vs')
      .where('vs.patient_id', patientId)
      .orderBy('vs.measured_at', 'desc'),

    db('patient_attachments as pa')
      .leftJoin('doctors as d', 'pa.doctor_id', 'd.id')
      .leftJoin('users as u', 'd.user_id', 'u.id')
      .where('pa.patient_id', patientId)
      .select('pa.*', 'u.full_name as doctor_name')
      .orderBy('pa.created_at', 'desc')
  ]);
  console.log('[DEBUG] All history queries finished');

  // Enrich prescriptions with items
  const rxWithItems = await Promise.all(prescriptions.map(async (rx) => {
    const items = await db('prescription_items').where({ prescription_id: rx.id });
    return { ...rx, items };
  }));
  console.log('[DEBUG] Prescriptions enriched');

  return {
    patient,
    records,
    diagnoses,
    prescriptions: rxWithItems,
    vitals,
    attachments
  };
}

async function addAttachment(patientId, data, user) {
  const patient = await db('patients').where({ id: patientId }).first();
  if (!patient) throw AppError.notFound('Patient');

  if (user.role !== 'super_admin' && patient.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  let doctorId = null;
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    doctorId = doc?.id;
  }

  const [attachment] = await db('patient_attachments')
    .insert({
      patient_id: patientId,
      doctor_id:  doctorId,
      title:      data.title,
      description:data.description || null,
      file_url:   data.file_url,
      file_type:  data.file_type || null,
      category:   data.category || 'lab_result',
    })
    .returning('*');

  return attachment;
}

module.exports = {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  getPatientTimeline,
  getPatientFullHistory,
  addAttachment,
};
