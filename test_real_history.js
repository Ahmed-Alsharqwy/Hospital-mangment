const knex = require('knex');
require('dotenv').config();

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  }
});

async function testHistory(patientId) {
  try {
    console.log('Running history query for patient:', patientId);
    
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

    console.log('Queries successful!');
    console.log('Records count:', records.length);
    console.log('Diagnoses count:', diagnoses.length);
    console.log('Prescriptions count:', prescriptions.length);
    console.log('Vitals count:', vitals.length);
    console.log('Attachments count:', attachments.length);

    const prescriptionIds = prescriptions.map(rx => rx.id);
    if (prescriptionIds.length > 0) {
        console.log('Fetching prescription items...');
        const items = await db('prescription_items').whereIn('prescription_id', prescriptionIds);
        console.log('Items count:', items.length);
    }

  } catch (err) {
    console.error('History Query FAILED:', err);
  } finally {
    await db.destroy();
  }
}

testHistory('698c04e8-6a91-427e-8fba-f180bdacdfbd');
