// src/app.js
require('dotenv').config();
require('express-async-errors'); // Must be before express

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const http        = require('http');
const { Server }  = require('socket.io');

const { testConnection } = require('./db/knex');
const errorHandler        = require('./middleware/errorHandler');
const rateLimiter         = require('./middleware/rateLimiter');

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
const permissionsRoutes     = require('./modules/permissions/permissions.routes');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
  },
});

// Make io accessible from anywhere via req.app.get('io')
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Join a room by userId so we can push personal notifications
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} joined room user:${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ── Security middlewares ──────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP if it interferes with Vite dev or specific medical images
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());

// Global rate limiter: max 100 requests per minute per IP
app.use(rateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'لقد تجاوزت عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً.'
}));

const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Logging ──────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Body parsing ─────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files (uploads) ───────────────────
const { authenticate } = require('./middleware/auth');
app.use('/uploads', authenticate, express.static(process.env.UPLOAD_DIR || './uploads'));

// ── Health check ─────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    version:   process.env.API_VERSION || 'v1',
    env:       process.env.NODE_ENV,
  });
});

// ── API Routes ───────────────────────────────
const api = `/api/${process.env.API_VERSION || 'v1'}`;

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

// ── 404 handler ──────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    code:    'ROUTE_NOT_FOUND',
  });
});

// ── Global error handler ──────────────────────
app.use(errorHandler);

// Export for Vercel
module.exports = app;

// Start server locally if not on Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT) || 5000;
  testConnection().then(() => {
    server.listen(PORT, () => {
      console.log(`\n🚀 Medical Hub API running locally on port ${PORT}\n`);
    });
  }).catch(err => console.error('Failed to start server:', err));
}
