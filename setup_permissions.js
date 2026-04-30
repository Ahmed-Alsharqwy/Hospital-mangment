const { db } = require('./src/db/knex');
require('dotenv').config();

async function createPermissionsTable() {
  try {
    const hasTable = await db.schema.hasTable('role_permissions');
    if (!hasTable) {
      await db.schema.createTable('role_permissions', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('uuid_generate_v4()'));
        table.string('role').notNullable();
        table.string('module').notNullable();
        table.boolean('can_view').defaultTo(false);
        table.boolean('can_create').defaultTo(false);
        table.boolean('can_edit').defaultTo(false);
        table.boolean('can_delete').defaultTo(false);
        table.unique(['role', 'module']);
      });
      console.log('✅ Created role_permissions table');

      // Seed default permissions
      const roles = ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist'];
      const modules = ['patients', 'appointments', 'billing', 'reports', 'settings', 'records'];
      
      const seedData = [];
      for (const role of roles) {
        for (const module of modules) {
          const isSuper = role === 'super_admin';
          const isAdmin = role === 'admin';
          seedData.push({
            role,
            module,
            can_view: isSuper || isAdmin || (role === 'doctor' && module !== 'settings'),
            can_create: isSuper || isAdmin,
            can_edit: isSuper || isAdmin,
            can_delete: isSuper,
          });
        }
      }
      await db('role_permissions').insert(seedData);
      console.log('✅ Seeded default permissions');
    } else {
      console.log('ℹ️ role_permissions table already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createPermissionsTable();
