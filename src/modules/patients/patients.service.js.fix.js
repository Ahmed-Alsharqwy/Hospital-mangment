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
