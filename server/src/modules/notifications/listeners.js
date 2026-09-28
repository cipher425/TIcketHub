import { DOMAIN_EVENTS, NOTIFICATION_TYPE as T } from '../../config/constants.js';
import { domainEvents } from '../../infra/events/domainEvents.js';
import { broadcast } from '../../infra/realtime.js';
import { notify } from './dispatcher.js';

const rupees = (paise) => `Rs ${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Subscribes side effects to domain events. The booking service knows nothing about
 * notifications or sockets - it only announces what happened.
 */
export function registerListeners() {
  domainEvents.subscribe(DOMAIN_EVENTS.BOOKING_CONFIRMED, async (e) => {
    const link = `/account/bookings/${e.bookingId}`;
    await notify(e.userId, {
      type: T.PAYMENT_SUCCESS,
      title: 'Payment successful',
      body: `We received ${rupees(e.total)} for booking ${e.bookingRef}.`,
      link,
      dedupeKey: `payment:${e.bookingId}`,
    });
    await notify(e.userId, {
      type: T.BOOKING_CONFIRMED,
      title: `You're going to ${e.eventTitle}!`,
      body: `Seats ${e.seats.join(', ')} are confirmed. Your tickets are ready.`,
      link,
      dedupeKey: `confirmed:${e.bookingId}`,
    });
  });

  domainEvents.subscribe(DOMAIN_EVENTS.BOOKING_CANCELLED, (e) =>
    notify(e.userId, {
      type: T.BOOKING_CANCELLED,
      title: `Booking cancelled - ${e.eventTitle}`,
      body: e.refundAmount > 0 ? `A refund of ${rupees(e.refundAmount)} has been initiated.` : 'No refund applies to this cancellation.',
      link: `/account/bookings/${e.bookingId}`,
      dedupeKey: `cancelled:${e.bookingId}`,
    })
  );

  domainEvents.subscribe(DOMAIN_EVENTS.BOOKING_FAILED, (e) =>
    notify(e.userId, {
      type: T.BOOKING_FAILED,
      title: 'Booking could not be completed',
      body: `Your seats for ${e.eventTitle} were no longer available when payment completed. ${rupees(e.total)} is being refunded.`,
      link: `/account/bookings/${e.bookingId}`,
      dedupeKey: `failed:${e.bookingId}`,
    })
  );

  domainEvents.subscribe(DOMAIN_EVENTS.ORGANIZER_REVIEWED, (e) =>
    notify(e.userId, {
      type: e.approved ? T.ORGANIZER_APPROVED : T.ORGANIZER_REJECTED,
      title: e.approved ? 'You are now an organizer!' : 'Organizer application update',
      body: e.approved ? 'Head to the organizer dashboard to create your first event.' : e.reason || 'Your application was not approved.',
      link: e.approved ? '/organizer' : '/account/profile',
    })
  );

  // Real-time fan-out (no-op unless REALTIME_ENABLED)
  domainEvents.subscribe(DOMAIN_EVENTS.SEATS_CHANGED, (e) => broadcast(`event:${e.eventId}`, 'seats:update', e));
  domainEvents.subscribe(DOMAIN_EVENTS.BOOKING_UPDATED, (e) => broadcast(`user:${e.userId}`, 'booking:update', e));
}
