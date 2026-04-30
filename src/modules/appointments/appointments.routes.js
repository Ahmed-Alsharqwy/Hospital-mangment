// src/modules/appointments/appointments.routes.js
const router   = require('express').Router();
const ctrl     = require('./appointments.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, hasPermission } = require('../../middleware/auth');
const {
  createAppointmentSchema,
  updateAppointmentSchema,
  updateStatusSchema,
  listAppointmentsSchema,
} = require('./appointments.schema');

router.use(authenticate);

router.get('/today',
  hasPermission('appointments', 'view'),
  ctrl.todayOverview
);

router.get('/',
  hasPermission('appointments', 'view'),
  validate(listAppointmentsSchema, 'query'),
  ctrl.list
);

router.get('/:id',
  hasPermission('appointments', 'view'),
  ctrl.getOne
);

router.post('/',
  hasPermission('appointments', 'create'),
  validate(createAppointmentSchema),
  ctrl.create
);

router.patch('/:id',
  hasPermission('appointments', 'edit'),
  validate(updateAppointmentSchema),
  ctrl.update
);

// Status updates
router.patch('/:id/status',
  hasPermission('appointments', 'edit'),
  validate(updateStatusSchema),
  ctrl.updateStatus
);

module.exports = router;
