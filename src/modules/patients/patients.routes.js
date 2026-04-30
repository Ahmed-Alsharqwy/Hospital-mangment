// src/modules/patients/patients.routes.js
const router   = require('express').Router();
const ctrl     = require('./patients.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, hasPermission } = require('../../middleware/auth');
const { createPatientSchema, updatePatientSchema, listPatientsSchema } = require('./patients.schema');

router.use(authenticate);

router.get('/',
  hasPermission('patients', 'view'),
  validate(listPatientsSchema, 'query'),
  ctrl.list
);

// Specific routes first
router.get('/:id/history',
  hasPermission('patients', 'view'),
  ctrl.history
);

router.get('/:id/timeline',
  hasPermission('patients', 'view'),
  ctrl.timeline
);

router.post('/:id/attachments',
  hasPermission('patients', 'create'),
  ctrl.addAttachment
);

// Generic CRUD
router.post('/',
  hasPermission('patients', 'create'),
  validate(createPatientSchema),
  ctrl.create
);

router.get('/:id',
  hasPermission('patients', 'view'),
  ctrl.getOne
);

router.patch('/:id',
  hasPermission('patients', 'edit'),
  validate(updatePatientSchema),
  ctrl.update
);

router.delete('/:id',
  hasPermission('patients', 'delete'),
  ctrl.remove
);

module.exports = router;
