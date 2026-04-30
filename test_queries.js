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

async function run() {
  const patientId = '00000000-0000-0000-0000-000000000000'; // Dummy ID to test syntax
  try {
    console.log('Testing medical_records query...');
    await db('medical_records as mr')
      .join('doctors as d', 'mr.doctor_id', 'd.id')
      .join('users as u', 'd.user_id', 'u.id')
      .where('mr.patient_id', patientId)
      .select('mr.*', 'u.full_name as doctor_name', 'd.specialization')
      .orderBy('mr.visit_date', 'desc');

    console.log('Testing diagnoses query...');
    await db('diagnoses as dg')
      .join('medical_records as mr', 'dg.medical_record_id', 'mr.id')
      .where('mr.patient_id', patientId)
      .select('dg.*', 'mr.visit_date')
      .orderBy('dg.created_at', 'desc');

    console.log('Testing prescriptions query...');
    await db('prescriptions as rx')
      .join('medical_records as mr', 'rx.medical_record_id', 'mr.id')
      .join('doctors as d', 'rx.doctor_id', 'd.id')
      .join('users as u', 'd.user_id', 'u.id')
      .where('rx.patient_id', patientId)
      .select('rx.*', 'u.full_name as doctor_name')
      .orderBy('rx.issued_at', 'desc');

    console.log('Testing vital_signs query...');
    await db('vital_signs as vs')
      .where('vs.patient_id', patientId)
      .orderBy('vs.measured_at', 'desc');

    console.log('Testing patient_attachments query...');
    await db('patient_attachments as pa')
      .leftJoin('doctors as d', 'pa.doctor_id', 'd.id')
      .leftJoin('users as u', 'd.user_id', 'u.id')
      .where('pa.patient_id', patientId)
      .select('pa.*', 'u.full_name as doctor_name')
      .orderBy('pa.created_at', 'desc');

    console.log('All queries passed syntax check!');
  } catch (err) {
    console.error('Query failed:', err.message);
  } finally {
    await db.destroy();
  }
}

run();
