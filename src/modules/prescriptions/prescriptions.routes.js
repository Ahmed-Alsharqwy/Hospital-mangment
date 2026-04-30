// src/modules/prescriptions/prescriptions.routes.js
const router   = require('express').Router();
const ctrl     = require('./prescriptions.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { createPrescriptionSchema } = require('./prescriptions.schema');

router.use(authenticate);

router.post('/',
  authorize('super_admin', 'admin', 'doctor'),
  validate(createPrescriptionSchema),
  ctrl.create
);

router.get('/:id', ctrl.getOne);

router.get('/patient/:patientId', ctrl.listByPatient);

router.patch('/:id/cancel',
  authorize('super_admin', 'admin', 'doctor'),
  ctrl.cancel
);

module.exports = router;
