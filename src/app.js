// src/app.js
require('dotenv').config();
require('express-async-errors');

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');

const { db, testConnection } = require('./db/knex');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter  = require('./middleware/rateLimiter');

// ── Routes ──────────────────────────────────
const authRoutes           = require('./modules/auth/auth.routes');
const patientsRoutes       = require('./modules/patients/patients.routes');
const doctorsRoutes        = require('./modules/doctors/doctors.routes');
const nursesRoutes         = require('./modules/nurses/nurses.routes');
const appointmentsRoutes   = require('./modules/appointments/appointments.routes');
const medicalRecordsRoutes = require('./modules/medical-records/medical-records.routes');
const prescriptionsRoutes  = require('./modules/prescriptions/prescriptions.routes');
const invoicesRoutes       = require('./modules/invoices/invoices.routes');
const dashboardRoutes      = require('./modules/dashboard/dashboard.routes');
const notificationsRoutes  = require('./modules/notifications/notifications.routes');
const analyticsRoutes      = require('./modules/analytics/analytics.routes');
const settingsRoutes       = require('./modules/settings/settings.routes');
const permissionsRoutes    = require('./modules/permissions/permissions.routes');

const app = express();
const api = `/api/${process.env.API_VERSION || 'v1'}`;

// ── Middleware ──────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// ── Root / Health ───────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Medical Hub API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), version: 'v1', env: process.env.NODE_ENV });
});

// ── Magic Seeding Route (Temporary) ──────────
app.get(`${api}/seed-database`, async (req, res) => {
  console.log('--- STARTING REMOTE SEED ---');
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    // Test connection first with a timeout
    console.log('Testing DB connection...');
    await db.raw('SELECT 1').timeout(5000); 
    console.log('DB Connection OK');

    await db.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('Extension checked');

    // Create Org
    const [org] = await db('organizations').insert({
      id: uuidv4(),
      name: 'Medical Hub Center',
      name_ar: 'المركز الطبي التخصصي',
      type: 'clinic'
    }).returning('*');

    // Create Branch
    const [branch] = await db('branches').insert({
      id: uuidv4(),
      org_id: org.id,
      name: 'Main Branch',
      name_ar: 'الفرع الرئيسي',
      is_main: true
    }).returning('*');

    // Create Admin
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db('users').insert({
      id: uuidv4(),
      branch_id: branch.id,
      email: 'admin@medical.com',
      password_hash: passwordHash,
      role: 'super_admin',
      full_name: 'System Admin',
      is_active: true
    });

    // Create Permissions Table & Data
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

      const roles = ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist'];
      const modules = ['patients', 'appointments', 'billing', 'reports', 'settings', 'records', 'permissions'];
      const seedData = [];
      for (const role of roles) {
        for (const module of modules) {
          const isSuper = role === 'super_admin';
          seedData.push({
            role, module,
            can_view: true,
            can_create: isSuper,
            can_edit: isSuper,
            can_delete: isSuper
          });
        }
      }
      await db('role_permissions').insert(seedData);
    }

    res.json({ success: true, message: 'Database initialized! Login with admin@medical.com / admin123' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API Routes ───────────────────────────────
app.use(`${api}/auth`,            authRoutes);
app.use(`${api}/dashboard`,       dashboardRoutes);
app.use(`${api}/patients`,        patientsRoutes);
app.use(`${api}/doctors`,         doctorsRoutes);
app.use(`${api}/nurses`,          nursesRoutes);
app.use(`${api}/appointments`,    appointmentsRoutes);
app.use(`${api}/medical-records`, medicalRecordsRoutes);
app.use(`${api}/prescriptions`,   prescriptionsRoutes);
app.use(`${api}/invoices`,        invoicesRoutes);
app.use(`${api}/notifications`,   notificationsRoutes);
app.use(`${api}/analytics`,       analyticsRoutes);
app.use(`${api}/settings`,        settingsRoutes);
app.use(`${api}/permissions`,     permissionsRoutes);

// ── Error Handling ───────────────────────────
app.use(errorHandler);

// Conditional Start for Local Development
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  testConnection().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
