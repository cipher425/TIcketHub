import { env } from '../../../config/env.js';
import { mongoReservationStore } from './mongoReservationStore.js';
import { redisReservationStore } from './redisReservationStore.js';

/**
 * The SeatReservationStore seam. The booking service only ever talks to this interface:
 *
 *   hold({ eventId, seatIds, holdId, userId, expiresAt }) -> { ok, unavailable[] }
 *   release({ eventId, holdId, seatIds })
 *   extend({ eventId, holdId, seatIds, expiresAt })
 *   commit({ eventId, holdId, seatIds, bookingId, session }) -> boolean   (inside a transaction)
 *   afterCommit({ eventId, holdId, seatIds })                          (after the transaction)
 *   reopen({ eventId, seatIds, session })                              (cancellation)
 *   getAvailability(eventId) -> [{ id, s }]                            (only non-available seats)
 *   sweepExpired() -> number
 *
 * Switching Stage 1 -> Stage 3 is a config change: RESERVATION_STORE=redis.
 */
export function getReservationStore() {
  return env.RESERVATION_STORE === 'redis' ? redisReservationStore : mongoReservationStore;
}
