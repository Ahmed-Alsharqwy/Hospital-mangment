// src/modules/medical-records/medical-records.routes.js
const router   = require('express').Router();
const ctrl     = require('./medical-records.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, hasPermission } = require('../../middleware/auth');
const {
  createRecordSchema, updateRecordSchema,
  vitalSignsSchema, diagnosisSchema, listRecordsSchema,
} = require('./medical-records.schema');

router.use(authenticate);

// Records
router.get('/',
  hasPermission('records', 'view'),
  validate(listRecordsSchema, 'query'),
  ctrl.list
);

router.get('/:id',
  hasPermission('records', 'view'),
  ctrl.getOne
);

router.post('/',
  hasPermission('records', 'create'),
  validate(createRecordSchema),
  ctrl.create
);

router.patch('/:id',
  hasPermission('records', 'edit'),
  validate(updateRecordSchema),
  ctrl.update
);

// Vital signs
router.post('/:id/vitals',
  hasPermission('records', 'create'),
  validate(vitalSignsSchema),
  ctrl.addVitals
);

// Diagnoses
router.post('/:id/diagnoses',
  hasPermission('records', 'edit'),
  validate(diagnosisSchema),
  ctrl.addDiagnosis
);

router.patch('/:id/diagnoses/:diagnosisId',
  hasPermission('records', 'edit'),
  validate(diagnosisSchema.fork(['description'], f => f.optional())),
  ctrl.updateDiagnosis
);

router.delete('/:id/diagnoses/:diagnosisId',
  hasPermission('records', 'delete'),
  ctrl.deleteDiagnosis
);

module.exports = router;
