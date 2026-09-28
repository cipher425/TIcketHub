import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import {
  BOOKING_STATUS as S,
  DOMAIN_EVENTS,
  PAYMENT_STATUS,
  ROLES,
  SEAT_CODE,
  SEAT_STATUS,
  TICKET_STATUS,
} from '../../config/constants.js';
import { Booking } from './booking.model.js';
import { Coupon } from './coupon.model.js';
import { transition } from './bookingStateMachine.js';
import { computePricing, resolveCoupon } from './pricing.service.js';
import { evaluateCancellation } from './cancellation.service.js';
import { Event } from '../events/event.model.js';
import { TicketType } from '../events/ticketType.model.js';
import { assertBookable } from '../events/eventRules.js';
import { EventSeat } from '../seating/eventSeat.model.js';
import { getReservationStore } from '../seating/reservation/index.js';
import { Payment } from '../payments/payment.model.js';
import { processRefund, requestRefund } from '../payments/refunds.service.js';
import { Ticket } from '../tickets/ticket.model.js';
import { issueTickets } from '../tickets/tickets.service.js';
import { User } from '../users/user.model.js';
import { withTransaction } from '../../infra/db/mongoose.js';
import { domainEvents } from '../../infra/events/domainEvents.js';
import { logger } from '../../infra/logger.js';
import { bookingRef } from '../../utils/codes.js';
import { pageMeta } from '../../utils/http.js';
import { badRequest, conflict, forbidden, gone, notFound } from '../../utils/AppError.js';

const store = () => getReservationStore();
const seatIdsOf = (booking) => booking.items.map((i) => i.seat);

function publishSeatChanges(eventId, seatIds, code) {
  domainEvents.publish(DOMAIN_EVENTS.SEATS_CHANGED, {
    eventId: String(eventId),
    changes: seatIds.map((id) => ({ id: String(id), s: code })),
  });
}

function publishBookingUpdate(booking) {
  domainEvents.publish(DOMAIN_EVENTS.BOOKING_UPDATED, {
    bookingId: String(booking._id),
    userId: String(booking.user),
    status: booking.status,
  });
}

export async function getOwnedBooking(bookingId, user) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw notFound('Booking');
  if (user.role !== ROLES.ADMIN && String(booking.user) !== user.id) throw forbidden('This booking belongs to someone else');
  return booking;
}

/* ------------------------------------------------------------------ */
/* 1. HOLD: user picks seats -> seats HELD for a few minutes -> PENDING */
/* ------------------------------------------------------------------ */

export async function createHold(user, { eventId, seatIds, couponCode }) {
  const ids = [...new Set(seatIds.map(String))];
  const event = await Event.findById(eventId).lean();
  assertBookable(event);

  const max = Math.min(event.policies?.maxSeatsPerBooking || env.MAX_SEATS_PER_BOOKING, env.MAX_SEATS_PER_BOOKING);
  if (ids.length > max) throw badRequest(`You can book at most ${max} seats per booking`, undefined, 'TOO_MANY_SEATS');

  const seats = await EventSeat.find({ _id: { $in: ids }, event: eventId })
    .select('label sectionName rowLabel ticketType status')
    .lean();
  if (seats.length !== ids.length) throw badRequest('Some seats do not belong to this event', undefined, 'INVALID_SEATS');
  const permanentlyTaken = seats.filter((s) => s.status === SEAT_STATUS.BOOKED || s.status === SEAT_STATUS.BLOCKED);
  if (permanentlyTaken.length) {
    throw conflict('Some seats are no longer available', { seatIds: permanentlyTaken.map((s) => String(s._id)) }, 'SEATS_UNAVAILABLE');
  }

  // One active hold per user per event. Picking new seats replaces the old selection.
  const existing = await Booking.findOne({ user: user.id, event: eventId, isActiveHold: true });
  if (existing) {
    if (existing.status === S.PAYMENT_PROCESSING) {
      throw conflict('You have a payment in progress for this event', { bookingId: String(existing._id) }, 'PAYMENT_IN_PROGRESS');
    }
    await releaseBookingHold(existing, 'Replaced by a new seat selection', 'user');
  }

  // Price snapshot: computed from OUR database, never from the request.
  const types = await TicketType.find({ _id: { $in: seats.map((s) => s.ticketType) } }).lean();
  const typeById = new Map(types.map((t) => [String(t._id), t]));
  const seatById = new Map(seats.map((s) => [String(s._id), s]));
  const items = ids
    .map((id) => {
      const seat = seatById.get(id);
      const type = typeById.get(String(seat.ticketType));
      return {
        seat: seat._id,
        label: seat.label,
        sectionName: seat.sectionName,
        rowLabel: seat.rowLabel,
        ticketType: type._id,
        ticketTypeName: type.name,
        price: type.price,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));

  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const coupon = await resolveCoupon(couponCode, { eventId, subtotal });
  const pricing = computePricing(items, coupon);

  const bookingId = new mongoose.Types.ObjectId();
  const holdExpiresAt = new Date(Date.now() + env.HOLD_DURATION_SECONDS * 1000);

  const result = await store().hold({ eventId, seatIds: ids, holdId: bookingId, userId: user.id, expiresAt: holdExpiresAt });
  if (!result.ok) {
    throw conflict('Some seats were just taken by someone else', { seatIds: result.unavailable }, 'SEATS_UNAVAILABLE');
  }

  let booking;
  try {
    booking = await Booking.create({
      _id: bookingId,
      bookingRef: bookingRef(),
      user: user.id,
      event: event._id,
      organizer: event.organizer,
      status: S.PENDING,
      isActiveHold: true,
      holdExpiresAt,
      eventTitle: event.title,
      eventSlug: event.slug,
      eventStartsAt: event.startsAt,
      venueName: event.venueName,
      city: event.city,
      bannerUrl: event.bannerUrl,
      items,
      pricing,
      coupon: coupon ? { code: coupon.code, discount: pricing.discount } : undefined,
      statusHistory: [{ to: S.PENDING, reason: 'Seats held', actor: 'user' }],
    });
  } catch (err) {
    // Never leave seats locked without a booking.
    await store().release({ eventId, holdId: bookingId, seatIds: ids });
    if (err.code === 11000) throw conflict('You already have seats on hold for this event', undefined, 'HOLD_EXISTS');
    throw err;
  }

  publishSeatChanges(eventId, ids, SEAT_CODE.HELD);
  return booking;
}

async function releaseBookingHold(booking, reason, actor) {
  await transition(booking._id, S.RELEASED, { from: S.PENDING, reason, actor });
  await store().release({ eventId: booking.event, holdId: booking._id, seatIds: seatIdsOf(booking) });
  publishSeatChanges(booking.event, seatIdsOf(booking), SEAT_CODE.AVAILABLE);
}

/** User leaves checkout ("Change seats" / "Cancel"). */
export async function releaseHold(user, bookingId) {
  const booking = await getOwnedBooking(bookingId, user);
  if (booking.status === S.PAYMENT_PROCESSING) {
    throw conflict('A payment is in progress for this booking. Please wait a moment.', undefined, 'PAYMENT_IN_PROGRESS');
  }
  if (booking.status !== S.PENDING) return booking; // already released/expired: nothing to do
  await releaseBookingHold(booking, 'Released by user', 'user');
  return Booking.findById(bookingId);
}

export async function applyCoupon(user, bookingId, code) {
  const booking = await getOwnedBooking(bookingId, user);
  if (booking.status !== S.PENDING) throw conflict('Coupons can only be changed before payment starts');
  if (booking.holdExpiresAt < new Date()) throw gone('Your seat hold has expired', 'HOLD_EXPIRED');
  const coupon = code ? await resolveCoupon(code, { eventId: booking.event, subtotal: booking.pricing.subtotal }) : null;
  const pricing = computePricing(booking.items, coupon);
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: S.PENDING },
    coupon
      ? { $set: { pricing, coupon: { code: coupon.code, discount: pricing.discount } } }
      : { $set: { pricing }, $unset: { coupon: 1 } },
    { new: true }
  );
  if (!updated) throw conflict('Booking changed, please refresh');
  return updated;
}

/** Called by payments when an order is created: give the user time to finish at the bank. */
export async function extendHoldForPayment(booking) {
  if (booking.graceApplied) return booking;
  const newExpiry = new Date(Math.max(booking.holdExpiresAt.getTime(), Date.now() + env.PAYMENT_GRACE_SECONDS * 1000));
  await store().extend({ eventId: booking.event, holdId: booking._id, seatIds: seatIdsOf(booking), expiresAt: newExpiry });
  return Booking.findOneAndUpdate(
    { _id: booking._id, isActiveHold: true },
    { $set: { holdExpiresAt: newExpiry, graceApplied: true } },
    { new: true }
  );
}

/* ------------------------------------------------------------------ */
/* 2. CONFIRM: payment captured -> seats BOOKED + tickets, atomically   */
/* ------------------------------------------------------------------ */

class SeatsLostError extends Error {}

/**
 * Applies a captured payment to its booking.
 *
 * Everything that must be all-or-nothing happens in ONE MongoDB transaction:
 *   payment CAPTURED + booking CONFIRMED + seats BOOKED + tickets issued + counters.
 *
 * Outcomes:
 *   CONFIRMED          normal success
 *   ALREADY_PROCESSED  same payment delivered twice (verify + webhook) -> no-op
 *   DUPLICATE_PAYMENT  a second, different payment for an already-settled booking -> caller refunds it
 *   SEATS_LOST         paid too late and someone else got a seat -> booking FAILED, caller refunds
 */
export async function confirmBooking(bookingId, { paymentId, providerPaymentId, actor = 'system' }) {
  let outcome;
  try {
    outcome = await withTransaction(async (session) => {
      const payment = await Payment.findOneAndUpdate(
        { _id: paymentId, status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.FAILED] } },
        { $set: { status: PAYMENT_STATUS.CAPTURED, providerPaymentId, capturedAt: new Date() }, $unset: { failureReason: 1 } },
        { new: true, session }
      );
      if (!payment) return { outcome: 'ALREADY_PROCESSED' };

      const booking = await Booking.findById(bookingId).session(session);
      if (!booking) throw notFound('Booking');
      if ([S.CONFIRMED, S.CANCELLED, S.FAILED].includes(booking.status)) return { outcome: 'DUPLICATE_PAYMENT' };

      const seatIds = seatIdsOf(booking);
      const committed = await store().commit({ eventId: booking.event, holdId: booking._id, seatIds, bookingId: booking._id, session });
      if (!committed) throw new SeatsLostError();

      const { booking: confirmed } = await transition(booking._id, S.CONFIRMED, {
        session,
        actor,
        reason: 'Payment captured',
        set: { confirmedAt: new Date() },
      });

      const [event, holder] = await Promise.all([
        Event.findById(booking.event).session(session).lean(),
        User.findById(booking.user).select('name').session(session).lean(),
      ]);
      await issueTickets({ booking: confirmed, event, holderName: holder?.name, session });
      await Event.updateOne(
        { _id: booking.event },
        { $inc: { seatsSold: seatIds.length, popularityScore: seatIds.length * 10 } },
        { session }
      );
      if (booking.coupon?.code) await Coupon.updateOne({ code: booking.coupon.code }, { $inc: { usedCount: 1 } }, { session });
      return { outcome: 'CONFIRMED', booking: confirmed };
    });
  } catch (err) {
    if (!(err instanceof SeatsLostError)) throw err;
    return markSeatsLost(bookingId, { paymentId, providerPaymentId });
  }

  if (outcome.outcome === 'CONFIRMED') {
    const b = outcome.booking;
    await store()
      .afterCommit({ eventId: b.event, holdId: b._id, seatIds: seatIdsOf(b) })
      .catch((err) => logger.warn({ err }, 'afterCommit cleanup failed'));
    publishSeatChanges(b.event, seatIdsOf(b), SEAT_CODE.BOOKED);
    publishBookingUpdate(b);
    domainEvents.publish(DOMAIN_EVENTS.BOOKING_CONFIRMED, {
      bookingId: String(b._id),
      userId: String(b.user),
      bookingRef: b.bookingRef,
      eventTitle: b.eventTitle,
      total: b.pricing.total,
      seats: b.items.map((i) => i.label),
    });
  }
  return { ...outcome, booking: outcome.booking || (await Booking.findById(bookingId)) };
}

async function markSeatsLost(bookingId, { paymentId, providerPaymentId }) {
  await Payment.updateOne(
    { _id: paymentId, status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.FAILED] } },
    { $set: { status: PAYMENT_STATUS.CAPTURED, providerPaymentId, capturedAt: new Date() } }
  );
  const { booking } = await transition(bookingId, S.FAILED, {
    idempotent: true,
    reason: 'Seats were no longer available when the payment completed',
    set: { failureReason: 'Your payment arrived after your seat hold expired and the seats were taken. A full refund has been initiated.' },
  });
  await store().release({ eventId: booking.event, holdId: booking._id, seatIds: seatIdsOf(booking) });
  publishBookingUpdate(booking);
  domainEvents.publish(DOMAIN_EVENTS.BOOKING_FAILED, {
    bookingId: String(booking._id),
    userId: String(booking.user),
    eventTitle: booking.eventTitle,
    total: booking.pricing.total,
  });
  return { outcome: 'SEATS_LOST', booking };
}

/* ------------------------------------------------------------------ */
/* 3. EXPIRY (called by the sweeper job)                               */
/* ------------------------------------------------------------------ */

export async function expireBooking(booking) {
  try {
    await transition(booking._id, S.EXPIRED, { from: [S.PENDING, S.PAYMENT_PROCESSING], reason: 'Hold timed out' });
  } catch (err) {
    if (err.code === 'INVALID_BOOKING_TRANSITION' || err.code === 'BOOKING_CONCURRENT_UPDATE') return false; // confirmed meanwhile
    throw err;
  }
  await store().release({ eventId: booking.event, holdId: booking._id, seatIds: seatIdsOf(booking) });
  publishSeatChanges(booking.event, seatIdsOf(booking), SEAT_CODE.AVAILABLE);
  publishBookingUpdate({ ...booking, status: S.EXPIRED });
  return true;
}

/* ------------------------------------------------------------------ */
/* 4. CANCELLATION                                                     */
/* ------------------------------------------------------------------ */

async function cancellationContext(booking) {
  const [event, ticketsUsed] = await Promise.all([
    Event.findById(booking.event).lean(),
    Ticket.countDocuments({ booking: booking._id, status: TICKET_STATUS.USED }),
  ]);
  return { event, ticketsUsed };
}

export async function getCancellationQuote(user, bookingId) {
  const booking = await getOwnedBooking(bookingId, user);
  const { event, ticketsUsed } = await cancellationContext(booking);
  return evaluateCancellation({ booking, event, ticketsUsed });
}

/**
 * User cancellation (policy-based refund) or system cancellation when the organizer
 * cancels the whole event (`fullRefund`: 100% of the amount paid, fees included).
 */
export async function cancelBooking(bookingId, { user, reason, fullRefund = false }) {
  const booking = user ? await getOwnedBooking(bookingId, user) : await Booking.findById(bookingId);
  if (!booking) throw notFound('Booking');

  let refundAmount;
  let refundPercent;
  if (fullRefund) {
    if (booking.status !== S.CONFIRMED) return booking;
    refundAmount = booking.pricing.total;
    refundPercent = 100;
  } else {
    // The backend re-evaluates the policy - the frontend's quote is only for display.
    const { event, ticketsUsed } = await cancellationContext(booking);
    const decision = evaluateCancellation({ booking, event, ticketsUsed });
    if (!decision.allowed) throw conflict(decision.reason, undefined, 'CANCELLATION_NOT_ALLOWED');
    refundAmount = decision.refundAmount;
    refundPercent = decision.refundPercent;
  }

  const payment = await Payment.findOne({ booking: booking._id, status: PAYMENT_STATUS.CAPTURED }).lean();
  const by = user ? 'user' : 'system';
  const seatIds = seatIdsOf(booking);

  const cancelled = await withTransaction(async (session) => {
    const { booking: b } = await transition(booking._id, S.CANCELLED, {
      from: S.CONFIRMED,
      session,
      actor: by,
      reason,
      set: { cancellation: { at: new Date(), reason, by, refundPercent, refundAmount } },
    });
    await Ticket.updateMany({ booking: booking._id, status: TICKET_STATUS.ACTIVE }, { $set: { status: TICKET_STATUS.CANCELLED } }, { session });
    await store().reopen({ eventId: booking.event, seatIds, session });
    await Event.updateOne(
      { _id: booking.event },
      { $inc: { seatsSold: -seatIds.length, popularityScore: -seatIds.length * 10 } },
      { session }
    );
    if (payment && refundAmount > 0) await requestRefund(payment._id, refundAmount, reason, session);
    return b;
  });

  if (payment && refundAmount > 0) await processRefund(payment._id); // failures are retried by the refunds job
  publishSeatChanges(booking.event, seatIds, SEAT_CODE.AVAILABLE);
  publishBookingUpdate(cancelled);
  domainEvents.publish(DOMAIN_EVENTS.BOOKING_CANCELLED, {
    bookingId: String(cancelled._id),
    userId: String(cancelled.user),
    eventTitle: cancelled.eventTitle,
    refundAmount,
    by,
  });
  return cancelled;
}

/** Background job after an organizer cancels an event. */
export async function processEventCancellation(eventId, reason) {
  const active = await Booking.find({ event: eventId, isActiveHold: true }).lean();
  for (const b of active) {
    if (b.status === S.PENDING) await releaseBookingHold(b, 'Event cancelled', 'system').catch(() => {});
  }
  const confirmed = await Booking.find({ event: eventId, status: S.CONFIRMED }).select('_id').lean();
  let done = 0;
  for (const { _id } of confirmed) {
    try {
      await cancelBooking(_id, { reason: `Event cancelled by organizer: ${reason}`, fullRefund: true });
      done++;
    } catch (err) {
      logger.error({ err, bookingId: String(_id) }, 'Failed to cancel booking for cancelled event');
    }
  }
  return { cancelled: done, total: confirmed.length };
}

/* ------------------------------------------------------------------ */
/* 5. READS                                                            */
/* ------------------------------------------------------------------ */

export async function getBookingDetails(user, bookingId) {
  const booking = await getOwnedBooking(bookingId, user);
  const payments = await Payment.find({ booking: booking._id })
    .select('status amount provider providerOrderId failureReason refund capturedAt createdAt')
    .sort({ createdAt: -1 })
    .lean();
  return { ...booking.toObject(), payments };
}

export async function listMyBookings(user, { scope, page, limit }) {
  const now = new Date();
  const filters = {
    upcoming: { user: user.id, status: S.CONFIRMED, eventStartsAt: { $gte: now } },
    past: {
      user: user.id,
      $or: [{ status: S.CONFIRMED, eventStartsAt: { $lt: now } }, { status: { $in: [S.CANCELLED, S.FAILED] } }],
    },
    active: { user: user.id, isActiveHold: true },
  };
  const filter = filters[scope];
  const sort = scope === 'upcoming' ? { eventStartsAt: 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    Booking.find(filter).select('-statusHistory').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

export function getActiveHold(user, eventId) {
  return Booking.findOne({ user: user.id, event: eventId, isActiveHold: true }).lean();
}
