// src/modules/medical-records/medical-records.service.js
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');
const { logAudit } = require('../../middleware/audit');

// ─────────────────────────────────────────────
// Medical Records
// ─────────────────────────────────────────────

async function listRecords(queryParams, user) {
  const { page, limit, patient_id, doctor_id, date_from, date_to } = queryParams;

  let query = db('medical_records as mr')
    .join('patients as p', 'mr.patient_id', 'p.id')
    .join('doctors as d',  'mr.doctor_id',  'd.id')
    .join('users as u',    'd.user_id',     'u.id')
    .select(
      'mr.id', 'mr.visit_date', 'mr.chief_complaint', 'mr.status', 'mr.created_at',
      'p.id as patient_id', 'p.mrn', 'p.full_name as patient_name',
      'd.id as doctor_id', 'u.full_name as doctor_name', 'd.specialization'
    )
    .orderBy('mr.visit_date', 'desc');

  // Doctors see only their own records
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    if (doc) query = query.where('mr.doctor_id', doc.id);
  } else if (user.role !== 'super_admin') {
    query = query.where('p.branch_id', user.branch_id);
  }

  if (patient_id) query = query.where('mr.patient_id', patient_id);
  if (doctor_id)  query = query.where('mr.doctor_id',  doctor_id);
  if (date_from)  query = query.where('mr.visit_date', '>=', date_from);
  if (date_to)    query = query.where('mr.visit_date', '<=', date_to);

  const { count } = await query.clone().clearSelect().clearOrder().count('mr.id as count').first();
  const { query: pq, page: pg, limit: lm } = paginate(query, { page, limit });
  const records = await pq;

  return { records, total: parseInt(count), page: pg, limit: lm };
}

async function getRecord(id, user) {
  const record = await db('medical_records as mr')
    .join('patients as p', 'mr.patient_id', 'p.id')
    .join('doctors as d',  'mr.doctor_id',  'd.id')
    .join('users as u',    'd.user_id',     'u.id')
    .where('mr.id', id)
    .select('mr.*', 'p.full_name as patient_name', 'p.mrn', 'p.branch_id',
            'u.full_name as doctor_name', 'd.specialization')
    .first();

  if (!record) throw AppError.notFound('Medical record');

  // Access control
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    if (!doc || record.doctor_id !== doc.id) throw AppError.forbidden('Access denied');
  } else if (user.role !== 'super_admin' && record.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  // Fetch all sub-sections in parallel
  const [vitals, diagnoses, prescriptions] = await Promise.all([
    db('vital_signs').where({ medical_record_id: id }).orderBy('measured_at', 'desc'),
    db('diagnoses').where({ medical_record_id: id }).orderBy('created_at', 'asc'),
    db('prescriptions as rx')
      .join('prescription_items as ri', 'rx.id', 'ri.prescription_id')
      .where('rx.medical_record_id', id)
      .select('rx.*', db.raw("JSON_AGG(ri.*) AS items"))
      .groupBy('rx.id')
      .orderBy('rx.issued_at', 'desc'),
  ]);

  return { ...record, vitals, diagnoses, prescriptions };
}

async function createRecord(data, user) {
  // Only doctors and admins can create records
  let doctorId = data.doctor_id;

  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    if (!doc) throw AppError.forbidden('Doctor profile not found');
    doctorId = doc.id;
  }

  // Check appointment belongs to this doctor/patient if provided
  if (data.appointment_id) {
    const appt = await db('appointments').where({ id: data.appointment_id }).first();
    if (!appt) throw AppError.notFound('Appointment');
    if (appt.doctor_id !== doctorId || appt.patient_id !== data.patient_id) {
      throw AppError.badRequest('Appointment does not match doctor or patient');
    }
    // Check no existing record for this appointment
    const existing = await db('medical_records').where({ appointment_id: data.appointment_id }).first();
    if (existing) throw AppError.conflict('A medical record already exists for this appointment', 'DUPLICATE_RECORD');
  }

  const [record] = await db('medical_records')
    .insert({
      patient_id:           data.patient_id,
      doctor_id:            doctorId,
      appointment_id:       data.appointment_id || null,
      visit_date:           data.visit_date || new Date(),
      chief_complaint:      data.chief_complaint,
      history_of_illness:   data.history_of_illness || null,
      physical_examination: data.physical_examination || null,
      notes:                data.notes || null,
      status:               'draft',
    })
    .returning('*');

  // If linked to appointment, move it to in_progress
  if (data.appointment_id) {
    await db('appointments')
      .where({ id: data.appointment_id })
      .update({ status: 'in_progress', updated_at: new Date() });
  }

  await logAudit({
    userId: user.id, action: 'CREATE',
    entityType: 'medical_record', entityId: record.id,
  });

  return record;
}

async function updateRecord(id, data, user) {
  const existing = await db('medical_records as mr')
    .join('patients as p', 'mr.patient_id', 'p.id')
    .where('mr.id', id)
    .select('mr.*', 'p.branch_id')
    .first();

  if (!existing) throw AppError.notFound('Medical record');

  // Authorization
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    if (!doc || existing.doctor_id !== doc.id) throw AppError.forbidden('Access denied');
  } else if (user.role !== 'super_admin' && existing.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  if (existing.status === 'finalized') {
    throw AppError.badRequest('Finalized records cannot be modified', 'RECORD_FINALIZED');
  }

  const [updated] = await db('medical_records')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');

  // If finalizing, complete the linked appointment
  if (data.status === 'finalized' && existing.appointment_id) {
    await db('appointments')
      .where({ id: existing.appointment_id })
      .update({ status: 'completed', updated_at: new Date() });
  }

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'medical_record', entityId: id,
    oldValues: existing, newValues: data,
  });

  return updated;
}

// ─────────────────────────────────────────────
// Vital Signs
// ─────────────────────────────────────────────

async function addVitalSigns(recordId, data, user) {
  const record = await db('medical_records as mr')
    .join('patients as p', 'mr.patient_id', 'p.id')
    .where('mr.id', recordId)
    .select('mr.id', 'mr.status', 'mr.patient_id', 'p.branch_id')
    .first();

  if (!record) throw AppError.notFound('Medical record');

  // Auth: Branch check
  if (user.role !== 'super_admin' && record.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  if (record.status === 'finalized') throw AppError.badRequest('Record is finalized');

  const [vitals] = await db('vital_signs')
    .insert({
      medical_record_id: recordId,
      patient_id:        record.patient_id,
      measured_by:       user.id,
      ...data,
      measured_at: new Date(),
    })
    .returning('*');

  return vitals;
}

// ─────────────────────────────────────────────
// Diagnoses
// ─────────────────────────────────────────────

async function addDiagnosis(recordId, data, user) {
  const record = await db('medical_records as mr')
    .join('patients as p', 'mr.patient_id', 'p.id')
    .where('mr.id', recordId)
    .select('mr.id', 'mr.status', 'mr.doctor_id', 'p.branch_id')
    .first();

  if (!record) throw AppError.notFound('Medical record');

  // Auth
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).select('id').first();
    if (!doc || record.doctor_id !== doc.id) throw AppError.forbidden('Access denied');
  } else if (user.role !== 'super_admin' && record.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  if (record.status === 'finalized') throw AppError.badRequest('Record is finalized');

  const [diagnosis] = await db('diagnoses')
    .insert({ medical_record_id: recordId, ...data })
    .returning('*');

  return diagnosis;
}

async function updateDiagnosis(diagnosisId, data, user) {
  const diagnosis = await db('diagnoses').where({ id: diagnosisId }).first();
  if (!diagnosis) throw AppError.notFound('Diagnosis');

  const record = await db('medical_records').where({ id: diagnosis.medical_record_id }).first();
  if (record?.status === 'finalized') throw AppError.badRequest('Record is finalized');

  const [updated] = await db('diagnoses').where({ id: diagnosisId }).update(data).returning('*');
  return updated;
}

async function deleteDiagnosis(diagnosisId, user) {
  const diagnosis = await db('diagnoses').where({ id: diagnosisId }).first();
  if (!diagnosis) throw AppError.notFound('Diagnosis');

  const record = await db('medical_records').where({ id: diagnosis.medical_record_id }).first();
  if (record?.status === 'finalized') throw AppError.badRequest('Record is finalized');

  await db('diagnoses').where({ id: diagnosisId }).delete();
}

module.exports = {
  listRecords, getRecord, createRecord, updateRecord,
  addVitalSigns,
  addDiagnosis, updateDiagnosis, deleteDiagnosis,
};
