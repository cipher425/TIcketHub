import { Booking } from './booking.model.js';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS as S } from '../../config/constants.js';
import { conflict, notFound } from '../../utils/AppError.js';

/**
 * THE booking state machine. Every status change in the whole codebase goes through
 * `transition()` - no controller or service writes `booking.status = ...` directly.
 *
 *            create hold
 *                 |
 *                 v
 *   RELEASED <- PENDING <---------------+  payment failed, retry allowed
 *                 |                      |
 *                 v                      |
 *           PAYMENT_PROCESSING ----------+
 *                 |
 *        +--------+---------+-----------+
 *        v                  v           v
 *    CONFIRMED           EXPIRED      FAILED  (paid, but the seats were lost -> auto refund)
 *        |                  |
 *        v                  +--> CONFIRMED / FAILED  (late payment reconciliation)
 *    CANCELLED
 */
export const TRANSITIONS = Object.freeze({
  [S.PENDING]: [S.PAYMENT_PROCESSING, S.CONFIRMED, S.EXPIRED, S.RELEASED, S.FAILED],
  [S.PAYMENT_PROCESSING]: [S.PENDING, S.CONFIRMED, S.EXPIRED, S.FAILED],
  // A payment can land after the hold expired or was released (slow bank, closed tab).
  // If the seats are still free we honour it, otherwise it fails and is refunded.
  [S.EXPIRED]: [S.CONFIRMED, S.FAILED],
  [S.RELEASED]: [S.CONFIRMED, S.FAILED],
  [S.CONFIRMED]: [S.CANCELLED],
  [S.FAILED]: [],
  [S.CANCELLED]: [],
});

export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;

export class InvalidTransitionError extends Error {}

/**
 * Atomically moves a booking from its current status to `to`.
 *
 * Uses optimistic concurrency: the update only matches if the status is still what we read.
 * If two requests race (e.g. the payment webhook and the browser's /verify call), exactly
 * one wins; the other gets a 409 or, with `idempotent`, a harmless no-op.
 *
 * @param {object} opts
 * @param {string|string[]} [opts.from]  allowed current statuses (default: any valid predecessor)
 * @param {object} [opts.set]            extra fields to set in the same write
 * @param {boolean} [opts.idempotent]    if already in `to`, return { changed: false } instead of throwing
 */
export async function transition(bookingId, to, { from, reason, actor = 'system', set = {}, session, idempotent = false } = {}) {
  const current = await Booking.findById(bookingId).select('status').session(session).lean();
  if (!current) throw notFound('Booking');

  if (current.status === to && idempotent) {
    return { changed: false, booking: await Booking.findById(bookingId).session(session) };
  }
  const allowedFrom = from ? [].concat(from) : Object.keys(TRANSITIONS);
  if (!allowedFrom.includes(current.status) || !canTransition(current.status, to)) {
    throw conflict(`Booking cannot move from ${current.status} to ${to}`, { from: current.status, to }, 'INVALID_BOOKING_TRANSITION');
  }

  const update = {
    $set: { status: to, ...set },
    $push: { statusHistory: { from: current.status, to, at: new Date(), reason, actor } },
  };
  if (ACTIVE_BOOKING_STATUSES.includes(to)) update.$set.isActiveHold = true;
  else update.$unset = { isActiveHold: 1 };

  const booking = await Booking.findOneAndUpdate({ _id: bookingId, status: current.status }, update, { new: true, session });
  if (!booking) {
    throw conflict('Booking was modified by another request, please retry', undefined, 'BOOKING_CONCURRENT_UPDATE');
  }
  return { changed: true, from: current.status, booking };
}
