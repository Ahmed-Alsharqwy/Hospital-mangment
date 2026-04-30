const express = require('express');
const router = express.Router();
const controller = require('./settings.controller');
const { authenticate, authorize, hasPermission } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', 
  hasPermission('settings', 'view'),
  controller.getSettings
);

router.patch('/', 
  hasPermission('settings', 'edit'),
  controller.updateSettings
);

module.exports = router;
