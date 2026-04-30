// src/modules/prescriptions/prescriptions.service.js
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { logAudit } = require('../../middleware/audit');

async function generatePrescriptionNumber() {
  const result = await db.raw("SELECT generate_prescription_number() AS num");
  return result.rows[0].num;
}

async function createPrescription(data, user) {
  const record = await db('medical_records').where({ id: data.medical_record_id }).first();
  if (!record) throw AppError.notFound('Medical record');
  if (record.status === 'finalized') throw AppError.badRequest('Cannot add prescription to a finalized record');

  if (!data.items || data.items.length === 0) {
    throw AppError.badRequest('Prescription must include at least one medication', 'EMPTY_PRESCRIPTION');
  }

  let doctorId = data.doctor_id;
  if (user.role === 'doctor') {
    const doc = await db('doctors').where({ user_id: user.id }).first();
    if (!doc) throw AppError.forbidden('Doctor profile not found');
    doctorId = doc.id;
  }

  const prescriptionNumber = await generatePrescriptionNumber();

  return await db.transaction(async (trx) => {
    const [prescription] = await trx('prescriptions')
      .insert({
        medical_record_id:   data.medical_record_id,
        patient_id:          record.patient_id,
        doctor_id:           doctorId,
        prescription_number: prescriptionNumber,
        valid_until:         data.valid_until || null,
        notes:               data.notes || null,
      })
      .returning('*');

    const items = data.items.map(item => ({
      prescription_id: prescription.id,
      medication_name: item.medication_name,
      generic_name:    item.generic_name || null,
      dosage:          item.dosage,
      frequency:       item.frequency,
      duration:        item.duration,
      route:           item.route || 'oral',
      quantity:        item.quantity || 1,
      instructions:    item.instructions || null,
    }));

    const insertedItems = await trx('prescription_items').insert(items).returning('*');

    await logAudit({
      userId: user.id, action: 'CREATE',
      entityType: 'prescription', entityId: prescription.id,
      newValues: { prescription_number: prescriptionNumber, item_count: items.length },
    });

    return { ...prescription, items: insertedItems };
  });
}

async function getPrescription(id, user) {
  const rx = await db('prescriptions as rx')
    .join('patients as p', 'rx.patient_id', 'p.id')
    .join('doctors as d',  'rx.doctor_id',  'd.id')
    .join('users as u',    'd.user_id',     'u.id')
    .where('rx.id', id)
    .select('rx.*', 'p.full_name as patient_name', 'p.mrn',
            'u.full_name as doctor_name', 'd.specialization', 'p.branch_id')
    .first();

  if (!rx) throw AppError.notFound('Prescription');

  if (user.role !== 'super_admin' && rx.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  const items = await db('prescription_items').where({ prescription_id: id }).orderBy('created_at');
  return { ...rx, items };
}

async function listPatientPrescriptions(patientId, user) {
  const patient = await db('patients').where({ id: patientId }).first();
  if (!patient) throw AppError.notFound('Patient');

  if (user.role !== 'super_admin' && patient.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  const prescriptions = await db('prescriptions as rx')
    .join('doctors as d', 'rx.doctor_id', 'd.id')
    .join('users as u',   'd.user_id',    'u.id')
    .where('rx.patient_id', patientId)
    .select('rx.*', 'u.full_name as doctor_name', 'd.specialization')
    .orderBy('rx.issued_at', 'desc');

  // Attach items to each prescription
  const ids = prescriptions.map(p => p.id);
  const allItems = ids.length > 0
    ? await db('prescription_items').whereIn('prescription_id', ids)
    : [];

  return prescriptions.map(rx => ({
    ...rx,
    items: allItems.filter(i => i.prescription_id === rx.id),
  }));
}

async function cancelPrescription(id, user) {
  const rx = await db('prescriptions').where({ id }).first();
  if (!rx) throw AppError.notFound('Prescription');
  if (rx.status !== 'active') throw AppError.badRequest('Only active prescriptions can be cancelled');

  const [updated] = await db('prescriptions')
    .where({ id })
    .update({ status: 'cancelled' })
    .returning('*');

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'prescription', entityId: id,
    oldValues: { status: 'active' }, newValues: { status: 'cancelled' },
  });

  return updated;
}

module.exports = { createPrescription, getPrescription, listPatientPrescriptions, cancelPrescription };
