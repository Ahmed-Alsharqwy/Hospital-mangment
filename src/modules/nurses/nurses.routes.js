// src/modules/nurses/nurses.routes.js
const router   = require('express').Router();
const ctrl     = require('./nurses.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { createNurseSchema, updateNurseSchema, listNursesSchema } = require('./nurses.schema');

router.use(authenticate);

router.get('/',    validate(listNursesSchema, 'query'), ctrl.list);
router.get('/:id',                                      ctrl.getOne);

router.post('/',
  authorize('super_admin', 'admin'),
  validate(createNurseSchema),
  ctrl.create
);

router.patch('/:id',
  authorize('super_admin', 'admin'),
  validate(updateNurseSchema),
  ctrl.update
);

module.exports = router;
