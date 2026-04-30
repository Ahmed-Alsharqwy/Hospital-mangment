const { db } = require('./src/db/knex');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function seed() {
  try {
    console.log('🚀 Starting cloud seeding...');

    // 1. Create Organization
    const [org] = await db('organizations').insert({
      id: uuidv4(),
      name: 'الشامل للتقنية',
      name_ar: 'Al-Shamel Medical Center',
      type: 'clinic'
    }).returning('*');
    console.log('✅ Created Organization');

    // 2. Create Branch
    const [branch] = await db('branches').insert({
      id: uuidv4(),
      org_id: org.id,
      name: 'Main Branch',
      name_ar: 'الفرع الرئيسي',
      is_main: true
    }).returning('*');
    console.log('✅ Created Main Branch');

    // 3. Create Super Admin User
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db('users').insert({
      id: uuidv4(),
      branch_id: branch.id,
      email: 'admin@medical.com',
      password_hash: passwordHash,
      role: 'super_admin',
      full_name: 'System Admin'
    });
    console.log('✅ Created Super Admin (admin@medical.com / admin123)');

    // 4. Create Role Permissions Table
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

      const roles = ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist'];
      const modules = ['patients', 'appointments', 'billing', 'reports', 'settings', 'records', 'permissions'];
      
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
    }

    console.log('\n✨ Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during seeding:', err.message);
    process.exit(1);
  }
}

seed();
