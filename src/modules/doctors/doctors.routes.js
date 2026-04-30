// src/modules/doctors/doctors.routes.js
const router   = require('express').Router();
const ctrl     = require('./doctors.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { createDoctorSchema, updateDoctorSchema, listDoctorsSchema } = require('./doctors.schema');

router.use(authenticate);

router.get('/',    validate(listDoctorsSchema, 'query'), ctrl.list);
router.get('/:id',                                       ctrl.getOne);
router.get('/:id/schedule',                              ctrl.schedule);

router.post('/',
  authorize('super_admin', 'admin'),
  validate(createDoctorSchema),
  ctrl.create
);

router.patch('/:id',
  authorize('super_admin', 'admin'),
  validate(updateDoctorSchema),
  ctrl.update
);

module.exports = router;
