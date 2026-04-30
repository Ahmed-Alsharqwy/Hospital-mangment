const router = require('express').Router();
const ctrl = require('./permissions.controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

router.get('/users', ctrl.listUsers);
router.patch('/users/:userId', ctrl.updateUserPermission);
router.post('/users', ctrl.createUser);
router.patch('/users/:userId/toggle', ctrl.toggleUserActive);

module.exports = router;
