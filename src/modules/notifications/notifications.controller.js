// src/modules/notifications/notifications.controller.js
const service = require('./notifications.service');
const { ok, paginated } = require('../../utils/response');

async function list(req, res) {
  const { notifications, total, unread_count, page, limit } =
    await service.listNotifications(req.query, req.user);
  paginated(res, notifications, { page, limit, total });
}

async function markRead(req, res) {
  await service.markAsRead(req.params.id, req.user.id);
  ok(res, null, 'Marked as read');
}

async function markAllRead(req, res) {
  await service.markAllAsRead(req.user.id);
  ok(res, null, 'All notifications marked as read');
}

async function remove(req, res) {
  await service.deleteNotification(req.params.id, req.user.id);
  ok(res, null, 'Notification deleted');
}

module.exports = { list, markRead, markAllRead, remove };
