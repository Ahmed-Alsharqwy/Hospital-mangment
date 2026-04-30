// src/modules/notifications/notifications.service.js
const { db }   = require('../../db/knex');
const AppError = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');

async function listNotifications(queryParams, user) {
  const { page, limit } = queryParams;
  const is_read = queryParams.is_read === 'true' ? true
                : queryParams.is_read === 'false' ? false
                : undefined;

  let query = db('notifications').where({ user_id: user.id });

  if (is_read !== undefined) query = query.where({ is_read });

  const { count } = await query.clone().count('id as count').first();
  const { query: pq, page: pg, limit: lm } = paginate(query.orderBy('created_at', 'desc'), { page, limit });
  const notifications = await pq;

  // Unread count
  const { unread } = await db('notifications')
    .where({ user_id: user.id, is_read: false })
    .count('id as unread')
    .first();

  return { notifications, total: parseInt(count), unread_count: parseInt(unread), page: pg, limit: lm };
}

async function markAsRead(notificationId, userId) {
  const notif = await db('notifications').where({ id: notificationId, user_id: userId }).first();
  if (!notif) throw AppError.notFound('Notification');

  await db('notifications')
    .where({ id: notificationId })
    .update({ is_read: true, read_at: new Date() });
}

async function markAllAsRead(userId) {
  await db('notifications')
    .where({ user_id: userId, is_read: false })
    .update({ is_read: true, read_at: new Date() });
}

async function deleteNotification(notificationId, userId) {
  const notif = await db('notifications').where({ id: notificationId, user_id: userId }).first();
  if (!notif) throw AppError.notFound('Notification');
  await db('notifications').where({ id: notificationId }).delete();
}

module.exports = { listNotifications, markAsRead, markAllAsRead, deleteNotification };
