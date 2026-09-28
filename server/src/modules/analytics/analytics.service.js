import mongoose from 'mongoose';
import { Booking } from '../bookings/booking.model.js';
import { Event } from '../events/event.model.js';
import { EventSeat } from '../seating/eventSeat.model.js';
import { Payment } from '../payments/payment.model.js';
import { User } from '../users/user.model.js';
import { BOOKING_STATUS, EVENT_STATUS, ORGANIZER_STATUS, PAYMENT_STATUS, ROLES, SEAT_STATUS } from '../../config/constants.js';
import { escapeRegex, pageMeta } from '../../utils/http.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const DAY_MS = 86_400_000;

// Organizer revenue = ticket value (subtotal - discount). Convenience fee + tax belong to the platform.
const ticketRevenue = { $subtract: ['$pricing.subtotal', { $ifNull: ['$pricing.discount', 0] }] };

/** Fills missing days with zeros so charts don't have gaps. */
function fillDays(rows, days) {
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  const start = new Date(Date.now() - (days - 1) * DAY_MS);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const r = byDay.get(d);
    out.push({ date: d, tickets: r?.tickets || 0, revenue: r?.revenue || 0, bookings: r?.bookings || 0 });
  }
  return out;
}

async function salesSeries(match, days) {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await Booking.aggregate([
    { $match: { ...match, status: BOOKING_STATUS.CONFIRMED, confirmedAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$confirmedAt', timezone: 'Asia/Kolkata' } },
        tickets: { $sum: { $size: '$items' } },
        revenue: { $sum: ticketRevenue },
        bookings: { $sum: 1 },
      },
    },
  ]);
  return fillDays(rows, days);
}

async function salesByCategory(match) {
  const rows = await Booking.aggregate([
    { $match: { ...match, status: BOOKING_STATUS.CONFIRMED } },
    { $unwind: '$items' },
    { $group: { _id: '$items.ticketTypeName', tickets: { $sum: 1 }, revenue: { $sum: '$items.price' } } },
    { $sort: { revenue: -1 } },
  ]);
  return rows.map((r) => ({ name: r._id, tickets: r.tickets, revenue: r.revenue }));
}

export async function organizerOverview(organizerId, { days = 30 } = {}) {
  const match = { organizer: oid(organizerId) };
  const now = new Date();
  const [eventStats, totals, series, byCategory, topEvents] = await Promise.all([
    Event.aggregate([
      { $match: { organizer: oid(organizerId) } },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ['$status', EVENT_STATUS.PUBLISHED] }, 1, 0] } },
          upcoming: { $sum: { $cond: [{ $and: [{ $eq: ['$status', EVENT_STATUS.PUBLISHED] }, { $gt: ['$startsAt', now] }] }, 1, 0] } },
          seatsSold: { $sum: '$seatsSold' },
          totalSeats: { $sum: '$totalSeats' },
          checkedIn: { $sum: '$checkedInCount' },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { ...match, status: BOOKING_STATUS.CONFIRMED } },
      { $group: { _id: null, revenue: { $sum: ticketRevenue }, bookings: { $sum: 1 } } },
    ]),
    salesSeries(match, days),
    salesByCategory(match),
    Event.find({ organizer: organizerId, status: { $in: [EVENT_STATUS.PUBLISHED, EVENT_STATUS.UNPUBLISHED] } })
      .select('title startsAt seatsSold totalSeats checkedInCount')
      .sort({ startsAt: 1 })
      .limit(8)
      .lean(),
  ]);

  const e = eventStats[0] || {};
  const pastSold = await Event.aggregate([
    { $match: { organizer: oid(organizerId), startsAt: { $lt: now } } },
    { $group: { _id: null, sold: { $sum: '$seatsSold' }, checkedIn: { $sum: '$checkedInCount' } } },
  ]);
  const past = pastSold[0] || { sold: 0, checkedIn: 0 };

  return {
    kpis: {
      totalEvents: e.totalEvents || 0,
      publishedEvents: e.published || 0,
      upcomingEvents: e.upcoming || 0,
      ticketsSold: e.seatsSold || 0,
      revenue: totals[0]?.revenue || 0,
      bookings: totals[0]?.bookings || 0,
      checkedIn: e.checkedIn || 0,
      // Attendance rate is only meaningful for events that already happened.
      attendanceRate: past.sold ? past.checkedIn / past.sold : null,
      occupancy: e.totalSeats ? e.seatsSold / e.totalSeats : 0,
    },
    series,
    byCategory,
    occupancyByEvent: topEvents.map((ev) => ({
      id: String(ev._id),
      title: ev.title,
      startsAt: ev.startsAt,
      sold: ev.seatsSold,
      total: ev.totalSeats,
      checkedIn: ev.checkedInCount,
      occupancy: ev.totalSeats ? ev.seatsSold / ev.totalSeats : 0,
    })),
  };
}

export async function eventAnalytics(event, { days = 30 } = {}) {
  const match = { event: event._id };
  const [series, byCategory, bySection, totals, statusCounts] = await Promise.all([
    salesSeries(match, days),
    salesByCategory(match),
    EventSeat.aggregate([
      { $match: { event: event._id } },
      {
        $group: {
          _id: '$sectionName',
          total: { $sum: { $cond: [{ $ne: ['$status', SEAT_STATUS.BLOCKED] }, 1, 0] } },
          booked: { $sum: { $cond: [{ $eq: ['$status', SEAT_STATUS.BOOKED] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { ...match, status: BOOKING_STATUS.CONFIRMED } },
      { $group: { _id: null, revenue: { $sum: ticketRevenue }, bookings: { $sum: 1 } } },
    ]),
    Booking.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return {
    event: { id: String(event._id), title: event.title, startsAt: event.startsAt, status: event.status },
    kpis: {
      ticketsSold: event.seatsSold,
      totalSeats: event.totalSeats,
      occupancy: event.totalSeats ? event.seatsSold / event.totalSeats : 0,
      checkedIn: event.checkedInCount,
      attendanceRate: event.seatsSold ? event.checkedInCount / event.seatsSold : 0,
      revenue: totals[0]?.revenue || 0,
      bookings: totals[0]?.bookings || 0,
    },
    series,
    byCategory,
    bySection: bySection.map((s) => ({ name: s._id, total: s.total, booked: s.booked })),
    bookingStatuses: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
  };
}

/** Organizer booking management table. */
export async function listOrganizerBookings(user, { eventId, status, q, page, limit }) {
  const filter = user.role === ROLES.ADMIN ? {} : { organizer: user.id };
  if (eventId) filter.event = eventId;
  if (status) filter.status = status;
  else filter.status = { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.FAILED] };
  if (q) filter.bookingRef = new RegExp(`^${escapeRegex(q.toUpperCase())}`);

  const [rows, total] = await Promise.all([
    Booking.find(filter)
      .select('bookingRef user eventTitle eventStartsAt items pricing status confirmedAt createdAt cancellation')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Booking.countDocuments(filter),
  ]);
  const payments = await Payment.find({ booking: { $in: rows.map((r) => r._id) } })
    .select('booking status')
    .sort({ createdAt: 1 })
    .lean();
  const paymentStatus = new Map(payments.map((p) => [String(p.booking), p.status])); // latest wins

  const items = rows.map((b) => ({
    id: String(b._id),
    bookingRef: b.bookingRef,
    customer: { name: b.user?.name, email: b.user?.email },
    eventTitle: b.eventTitle,
    eventStartsAt: b.eventStartsAt,
    seats: b.items.map((i) => i.label),
    amount: b.pricing.total,
    ticketRevenue: b.pricing.subtotal - (b.pricing.discount || 0),
    paymentStatus: paymentStatus.get(String(b._id)) || null,
    status: b.status,
    confirmedAt: b.confirmedAt,
    createdAt: b.createdAt,
  }));
  return { items, meta: pageMeta({ page, limit }, total) };
}

export async function platformStats({ days = 30 } = {}) {
  const [usersByRole, pendingOrganizers, eventsByStatus, bookingTotals, series, refunds] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ 'organizerProfile.status': ORGANIZER_STATUS.PENDING }),
    Event.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.aggregate([
      { $match: { status: BOOKING_STATUS.CONFIRMED } },
      {
        $group: {
          _id: null,
          bookings: { $sum: 1 },
          gmv: { $sum: '$pricing.total' },
          platformRevenue: { $sum: { $add: ['$pricing.convenienceFee', '$pricing.tax'] } },
          tickets: { $sum: { $size: '$items' } },
        },
      },
    ]),
    salesSeries({}, days),
    Payment.aggregate([
      { $match: { status: { $in: [PAYMENT_STATUS.REFUNDED, PAYMENT_STATUS.REFUND_PENDING] } } },
      { $group: { _id: '$status', amount: { $sum: '$refund.amount' }, count: { $sum: 1 } } },
    ]),
  ]);
  const t = bookingTotals[0] || {};
  return {
    users: Object.fromEntries(usersByRole.map((u) => [u._id, u.count])),
    pendingOrganizers,
    events: Object.fromEntries(eventsByStatus.map((e) => [e._id, e.count])),
    bookings: t.bookings || 0,
    ticketsSold: t.tickets || 0,
    gmv: t.gmv || 0,
    platformRevenue: t.platformRevenue || 0,
    refunds: Object.fromEntries(refunds.map((r) => [r._id, { amount: r.amount, count: r.count }])),
    series,
  };
}
