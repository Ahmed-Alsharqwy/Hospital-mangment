// src/modules/invoices/invoices.routes.js
const router   = require('express').Router();
const ctrl     = require('./invoices.controller');
const validate = require('../../middleware/validate');
const { authenticate, authorize, hasPermission } = require('../../middleware/auth');
const { createInvoiceSchema, recordPaymentSchema, listInvoicesSchema } = require('./invoices.schema');

router.use(authenticate);

router.get('/revenue',
  hasPermission('billing', 'view'),
  ctrl.revenueSummary
);

router.get('/',
  hasPermission('billing', 'view'),
  validate(listInvoicesSchema, 'query'),
  ctrl.list
);

router.get('/:id',
  hasPermission('billing', 'view'),
  ctrl.getOne
);

router.post('/',
  hasPermission('billing', 'create'),
  validate(createInvoiceSchema),
  ctrl.create
);

router.post('/:id/payment',
  hasPermission('billing', 'edit'),
  validate(recordPaymentSchema),
  ctrl.recordPayment
);

router.patch('/:id/cancel',
  hasPermission('billing', 'delete'),
  ctrl.cancel
);

module.exports = router;
