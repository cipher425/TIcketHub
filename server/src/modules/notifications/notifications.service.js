import { Notification } from './notification.model.js';
import { pageMeta } from '../../utils/http.js';
import { broadcast } from '../../infra/realtime.js';
import { logger } from '../../infra/logger.js';

/** Actually stores (and later could email/SMS) a notification. Runs inside a job. */
export async function deliverNotification({ userId, type, title, body, link, dedupeKey }) {
  try {
    const n = await Notification.create({ user: userId, type, title, body, link, dedupeKey });
    broadcast(`user:${userId}`, 'notification:new', { id: String(n._id), title, type });
    // Stage 1 "email": log it. Plug Nodemailer/Resend here without touching callers.
    logger.debug({ to: userId, title }, 'Notification delivered');
    return n;
  } catch (err) {
    if (err.code === 11000) return null; // already delivered (job retried)
    throw err;
  }
}

export async function listNotifications(userId, { page, limit }) {
  const filter = { user: userId };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { items, meta: { ...pageMeta({ page, limit }, total), unread } };
}

export const unreadCount = (userId) => Notification.countDocuments({ user: userId, readAt: null });

export const markRead = (userId, id) =>
  Notification.findOneAndUpdate({ _id: id, user: userId }, { $set: { readAt: new Date() } }, { new: true });

export const markAllRead = (userId) => Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
