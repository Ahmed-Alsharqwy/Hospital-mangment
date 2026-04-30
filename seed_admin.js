const bcrypt = require('bcryptjs');
const knex = require('knex');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'medical_hub',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres user',
  }
});

async function seed() {
  try {
    console.log('Seeding initial data...');
    
    // 1. Create Organization
    const [org] = await db('organizations').insert({
      name: 'Medical Hub Main',
      name_ar: 'ميديكال هوب الرئيسي',
      type: 'hospital'
    }).returning('id');
    console.log('Created Organization:', org.id);

    // 2. Create Branch
    const [branch] = await db('branches').insert({
      org_id: org.id,
      name: 'Main Branch',
      name_ar: 'الفرع الرئيسي',
      is_main: true
    }).returning('id');
    console.log('Created Branch:', branch.id);

    // 3. Create Super Admin User
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const [user] = await db('users').insert({
      branch_id: branch.id,
      email: 'admin@medical.com',
      password_hash: hashedPassword,
      role: 'super_admin',
      full_name: 'Super Admin',
      full_name_ar: 'المدير العام'
    }).returning('id');
    console.log('Created User:', user.id);

    console.log('✅ Seeding completed successfully!');
    console.log('User: admin@medical.com');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
