import { env } from '../config/env.js';
import { BOOKING_STATUS, EVENT_STATUS, JOBS, NOTIFICATION_TYPE } from '../config/constants.js';
import { registerJob, schedule } from '../infra/jobs/index.js';
import { logger } from '../infra/logger.js';
import { Booking } from '../modules/bookings/booking.model.js';
import { expireBooking, processEventCancellation } from '../modules/bookings/bookings.service.js';
import { reconcileBooking } from '../modules/payments/payments.service.js';
import { retryPendingRefunds } from '../modules/payments/refunds.service.js';
import { getReservationStore } from '../modules/seating/reservation/index.js';
import { Event } from '../modules/events/event.model.js';
import { deliverNotification } from '../modules/notifications/notifications.service.js';
import { notify } from '../modules/notifications/dispatcher.js';
import { admitTick, ADMIT_INTERVAL_MS } from '../modules/waitingRoom/waitingRoom.service.js';

/**
 * Hold sweeper. Correctness does NOT depend on it (expired holds are already treated as free
 * by every read/hold - "lazy expiry"); it moves bookings to EXPIRED so users see the right
 * state and seat documents get tidied up.
 */
async function sweepHolds() {
  const stale = await Booking.find({ isActiveHold: true, holdExpiresAt: { $lt: new Date() } })
    .select('_id event user status items holdExpiresAt')
    .limit(500)
    .lean();
  let expired = 0;
  for (const booking of stale) {
    try {
      // Money may have arrived without us hearing about it (lost webhook, closed tab).
      if (booking.status === BOOKING_STATUS.PAYMENT_PROCESSING && (await reconcileBooking(booking._id))) continue;
      if (await expireBooking(booking)) expired++;
    } catch (err) {
      logger.error({ err, bookingId: String(booking._id) }, 'Failed to expire booking');
    }
  }
  const seatsFreed = await getReservationStore().sweepExpired();
  if (expired || seatsFreed) logger.info({ expired, seatsFreed }, 'Hold sweep');
  return { expired, seatsFreed };
}

async function sendEventReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const events = await Event.find({ status: EVENT_STATUS.PUBLISHED, startsAt: { $gt: now, $lte: soon }, reminderSentAt: null })
    .select('_id title startsAt venueName')
    .lean();
  for (const event of events) {
    const bookings = await Booking.find({ event: event._id, status: BOOKING_STATUS.CONFIRMED }).select('_id user items').lean();
    for (const b of bookings) {
      await notify(b.user, {
        type: NOTIFICATION_TYPE.EVENT_REMINDER,
        title: `${event.title} is coming up!`,
        body: `Starts ${event.startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} at ${event.venueName}. Seats: ${b.items.map((i) => i.label).join(', ')}.`,
        link: `/account/bookings/${b._id}`,
        dedupeKey: `reminder:${b._id}`,
      });
    }
    await Event.updateOne({ _id: event._id }, { $set: { reminderSentAt: now } });
  }
  return events.length;
}

export function registerJobs() {
  registerJob(JOBS.SWEEP_HOLDS, sweepHolds);
  registerJob(JOBS.RETRY_REFUNDS, retryPendingRefunds);
  registerJob(JOBS.EVENT_REMINDERS, sendEventReminders);
  registerJob(JOBS.SEND_NOTIFICATION, deliverNotification);
  registerJob(JOBS.PROCESS_EVENT_CANCELLATION, ({ eventId, reason }) => processEventCancellation(eventId, reason));
  registerJob(JOBS.WAITING_ROOM_ADMIT, admitTick);
}

export async function scheduleJobs() {
  await schedule(JOBS.SWEEP_HOLDS, env.HOLD_SWEEP_INTERVAL_SECONDS * 1000);
  await schedule(JOBS.RETRY_REFUNDS, 2 * 60_000);
  await schedule(JOBS.EVENT_REMINDERS, 15 * 60_000);
  if (env.WAITING_ROOM_ENABLED) await schedule(JOBS.WAITING_ROOM_ADMIT, ADMIT_INTERVAL_MS);
}
