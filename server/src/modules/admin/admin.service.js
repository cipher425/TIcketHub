import { User } from '../users/user.model.js';
import { Event } from '../events/event.model.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import { DOMAIN_EVENTS, EVENT_STATUS, MODERATION, ORGANIZER_STATUS, ROLES, USER_STATUS } from '../../config/constants.js';
import { domainEvents } from '../../infra/events/domainEvents.js';
import { escapeRegex, pageMeta } from '../../utils/http.js';
import { badRequest, conflict, notFound } from '../../utils/AppError.js';

export async function listUsers({ q, role, status, page, limit }) {
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items: items.map(({ passwordHash: _p, ...u }) => u), meta: pageMeta({ page, limit }, total) };
}

export async function updateUser(adminId, userId, { status, role }) {
  if (String(userId) === String(adminId)) throw badRequest('You cannot change your own role or status');
  const user = await User.findById(userId);
  if (!user) throw notFound('User');
  if (status) user.status = status;
  if (role) user.role = role;
  await user.save();
  // Suspension must take effect immediately: kill refresh tokens (access tokens are re-checked per request).
  if (status === USER_STATUS.SUSPENDED) await revokeAllSessions(user._id);
  return user;
}

export async function listOrganizerApplications({ status = ORGANIZER_STATUS.PENDING, page, limit }) {
  const filter = { 'organizerProfile.status': status };
  const [items, total] = await Promise.all([
    User.find(filter).sort({ 'organizerProfile.appliedAt': 1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

export async function reviewOrganizer(adminId, userId, { approve, reason }) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User');
  if (user.organizerProfile?.status !== ORGANIZER_STATUS.PENDING) throw conflict('This application is not pending');
  user.organizerProfile.status = approve ? ORGANIZER_STATUS.APPROVED : ORGANIZER_STATUS.REJECTED;
  user.organizerProfile.reviewedAt = new Date();
  user.organizerProfile.reviewedBy = adminId;
  if (!approve) user.organizerProfile.rejectionReason = reason;
  if (approve) user.role = ROLES.ORGANIZER;
  await user.save();
  domainEvents.publish(DOMAIN_EVENTS.ORGANIZER_REVIEWED, { userId: String(user._id), approved: approve, reason });
  return user;
}

export async function listEvents({ q, status, moderation, page, limit }) {
  const filter = {};
  if (status) filter.status = status;
  if (moderation) filter.moderation = moderation;
  if (q) filter.title = new RegExp(escapeRegex(q), 'i');
  const [items, total] = await Promise.all([
    Event.find(filter)
      .select('title slug status moderation moderationReason isFeatured highDemand city startsAt seatsSold totalSeats organizer')
      .populate('organizer', 'name email organizerProfile.orgName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Event.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

export async function moderateEvent(eventId, { action, reason }) {
  const event = await Event.findById(eventId);
  if (!event) throw notFound('Event');
  switch (action) {
    case 'suspend':
      event.moderation = MODERATION.SUSPENDED;
      event.moderationReason = reason;
      break;
    case 'restore':
      event.moderation = MODERATION.ACTIVE;
      event.moderationReason = undefined;
      break;
    case 'feature':
      if (event.status !== EVENT_STATUS.PUBLISHED) throw conflict('Only published events can be featured');
      event.isFeatured = true;
      break;
    case 'unfeature':
      event.isFeatured = false;
      break;
    case 'high-demand-on':
      event.highDemand = true;
      break;
    case 'high-demand-off':
      event.highDemand = false;
      break;
    default:
      throw badRequest('Unknown action');
  }
  await event.save();
  return event;
}
