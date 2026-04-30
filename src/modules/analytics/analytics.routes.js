const express = require('express');
const router = express.Router();
const controller = require('./analytics.controller');
const { authenticate, hasPermission } = require('../../middleware/auth');

router.get('/stats', 
  authenticate, 
  hasPermission('reports', 'view'),
  controller.getStats
);

module.exports = router;
