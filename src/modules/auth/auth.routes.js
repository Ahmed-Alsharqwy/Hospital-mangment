// src/modules/auth/auth.routes.js
const router   = require('express').Router();
const ctrl     = require('./auth.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  createUserSchema,
} = require('./auth.schema');

// Public routes
const rateLimiter = require('../../middleware/rateLimiter');

// Public routes
const loginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'محاولات تسجيل دخول كثيرة خاطئة، يرجى المحاولة بعد 15 دقيقة.'
});

router.post('/login',   loginLimiter, validate(loginSchema),   ctrl.login);
router.post('/refresh', validate(refreshSchema),  ctrl.refresh);

// Protected routes
router.use(authenticate);

router.post('/logout',          validate(refreshSchema),         ctrl.logout);
router.get('/me',                                                 ctrl.getMe);
router.patch('/change-password', validate(changePasswordSchema),  ctrl.changePassword);

// Admin only — create users
router.post('/users',
  authorize('super_admin', 'admin'),
  validate(createUserSchema),
  ctrl.createUser
);

module.exports = router;
