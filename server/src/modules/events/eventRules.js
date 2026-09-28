import { EVENT_STATUS, MODERATION } from '../../config/constants.js';
import { conflict, notFound } from '../../utils/AppError.js';

/**
 * Business rules about an event's sale state, in one place.
 * Used by the details page (to show a badge) and by the booking service (to allow/deny holds).
 */
export function computeBookingStatus(event, now = new Date()) {
  if (event.status === EVENT_STATUS.CANCELLED) return 'CANCELLED';
  if (event.endsAt <= now) return 'ENDED';
  if (event.status !== EVENT_STATUS.PUBLISHED || event.moderation !== MODERATION.ACTIVE) return 'UNAVAILABLE';
  if (event.startsAt <= now) return 'SALES_CLOSED';
  if (event.salesStartAt && event.salesStartAt > now) return 'NOT_STARTED';
  if (event.salesEndAt && event.salesEndAt <= now) return 'SALES_CLOSED';
  const left = (event.totalSeats || 0) - (event.seatsSold || 0);
  if (left <= 0) return 'SOLD_OUT';
  if (event.totalSeats && event.seatsSold / event.totalSeats >= 0.7) return 'FILLING_FAST';
  return 'AVAILABLE';
}

const MESSAGES = {
  CANCELLED: 'This event has been cancelled',
  ENDED: 'This event has ended',
  UNAVAILABLE: 'This event is not available for booking',
  SALES_CLOSED: 'Ticket sales for this event are closed',
  NOT_STARTED: 'Ticket sales have not started yet',
  SOLD_OUT: 'This event is sold out',
};

export function assertBookable(event) {
  if (!event) throw notFound('Event');
  const status = computeBookingStatus(event);
  if (status !== 'AVAILABLE' && status !== 'FILLING_FAST') throw conflict(MESSAGES[status], { bookingStatus: status }, 'EVENT_NOT_BOOKABLE');
}

export const publicVisibilityFilter = () => ({
  status: EVENT_STATUS.PUBLISHED,
  moderation: MODERATION.ACTIVE,
  endsAt: { $gte: new Date() },
});
