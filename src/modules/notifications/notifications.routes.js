// src/modules/notifications/notifications.routes.js
const router = require('express').Router();
const ctrl   = require('./notifications.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/',                ctrl.list);
router.patch('/read-all',      ctrl.markAllRead);
router.patch('/:id/read',      ctrl.markRead);
router.delete('/:id',          ctrl.remove);

module.exports = router;
