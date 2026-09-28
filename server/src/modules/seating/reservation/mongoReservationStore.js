import { EventSeat } from '../eventSeat.model.js';
import { SEAT_CODE, SEAT_STATUS } from '../../../config/constants.js';

const { AVAILABLE, HELD, BOOKED, BLOCKED } = SEAT_STATUS;
const CLEAR_HOLD = { holdId: 1, heldBy: 1, holdExpiresAt: 1 };

/** A seat counts as free if it is AVAILABLE, or HELD by a hold that has already expired ("lazy expiry"). */
const freeClause = (now) => ({ $or: [{ status: AVAILABLE }, { status: HELD, holdExpiresAt: { $lt: now } }] });

/**
 * Stage 1 reservation store: seat holds are stored on the EventSeat documents themselves.
 *
 * Correctness comes from MongoDB's single-document atomicity: the filter `status is free`
 * and the update `status = HELD` happen as one atomic step per seat, so two buyers can
 * never both hold the same seat.
 */
export const mongoReservationStore = {
  name: 'mongo',

  async hold({ eventId, seatIds, holdId, userId, expiresAt }) {
    const now = new Date();
    const res = await EventSeat.updateMany(
      { _id: { $in: seatIds }, event: eventId, ...freeClause(now) },
      { $set: { status: HELD, holdId, heldBy: userId, holdExpiresAt: expiresAt } }
    );
    if (res.modifiedCount === seatIds.length) return { ok: true, unavailable: [] };

    // Someone beat us to at least one seat: all-or-nothing, so undo the seats we did get.
    const mine = await EventSeat.find({ _id: { $in: seatIds }, holdId }).select('_id').lean();
    await this.release({ eventId, holdId });
    const mineSet = new Set(mine.map((s) => String(s._id)));
    return { ok: false, unavailable: seatIds.map(String).filter((id) => !mineSet.has(id)) };
  },

  async release({ eventId, holdId }) {
    await EventSeat.updateMany({ event: eventId, holdId, status: HELD }, { $set: { status: AVAILABLE }, $unset: CLEAR_HOLD });
  },

  async extend({ eventId, holdId, expiresAt }) {
    await EventSeat.updateMany({ event: eventId, holdId, status: HELD }, { $set: { holdExpiresAt: expiresAt } });
  },

  /**
   * HELD -> BOOKED inside the confirmation transaction. Also accepts seats whose hold lapsed
   * but which nobody else has taken (a payment that arrived slightly late still succeeds).
   * Returns false if any seat now belongs to someone else - the caller aborts the transaction.
   */
  async commit({ eventId, holdId, seatIds, bookingId, session }) {
    const now = new Date();
    const res = await EventSeat.updateMany(
      {
        _id: { $in: seatIds },
        event: eventId,
        $or: [{ status: HELD, holdId }, { status: AVAILABLE }, { status: HELD, holdExpiresAt: { $lt: now } }],
      },
      { $set: { status: BOOKED, booking: bookingId }, $unset: CLEAR_HOLD },
      { session }
    );
    return res.modifiedCount === seatIds.length;
  },

  async afterCommit() {},

  /** BOOKED -> AVAILABLE when a booking is cancelled, so the seats can be sold again. */
  async reopen({ eventId, seatIds, session }) {
    await EventSeat.updateMany(
      { _id: { $in: seatIds }, event: eventId, status: BOOKED },
      { $set: { status: AVAILABLE }, $unset: { booking: 1 } },
      { session }
    );
  },

  async getAvailability(eventId) {
    const now = Date.now();
    const seats = await EventSeat.find({ event: eventId, status: { $in: [HELD, BOOKED, BLOCKED] } })
      .select('status holdExpiresAt')
      .lean();
    const out = [];
    for (const s of seats) {
      if (s.status === HELD && (!s.holdExpiresAt || s.holdExpiresAt.getTime() < now)) continue;
      out.push({ id: String(s._id), s: SEAT_CODE[s.status] });
    }
    return out;
  },

  /** Housekeeping: physically reset holds that lapsed (lazy expiry already treats them as free). */
  async sweepExpired() {
    const res = await EventSeat.updateMany(
      { status: HELD, holdExpiresAt: { $lt: new Date() } },
      { $set: { status: AVAILABLE }, $unset: CLEAR_HOLD }
    );
    return res.modifiedCount;
  },
};
