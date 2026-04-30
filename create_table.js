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
  try {
    const exists = await db.schema.hasTable('patient_attachments');
    if (!exists) {
      await db.schema.createTable('patient_attachments', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('uuid_generate_v4()'));
        table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('CASCADE');
        table.uuid('doctor_id').references('id').inTable('doctors').onDelete('SET NULL');
        table.string('title').notNullable();
        table.text('description');
        table.string('file_url').notNullable();
        table.string('file_type');
        table.string('category').defaultTo('lab_result');
        table.timestamp('created_at').defaultTo(db.fn.now());
      });
      console.log('Table patient_attachments created successfully');
    } else {
      console.log('Table patient_attachments already exists');
    }
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await db.destroy();
  }
}

run();
