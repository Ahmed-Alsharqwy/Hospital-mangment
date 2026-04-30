const { db } = require('./src/db/knex');
require('dotenv').config();

async function addStatusColumn() {
  try {
    const hasColumn = await db.schema.hasColumn('patients', 'status');
    if (!hasColumn) {
      await db.schema.table('patients', (table) => {
        table.string('status', 20).defaultTo('active');
      });
      console.log('✅ Added status column to patients table');
    } else {
      console.log('ℹ️ Status column already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to add status column:', err.message);
    process.exit(1);
  }
}

addStatusColumn();
