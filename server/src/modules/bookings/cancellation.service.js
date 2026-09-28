import { BOOKING_STATUS, EVENT_STATUS } from '../../config/constants.js';

/**
 * Pure function: decides IF a booking can be cancelled and HOW MUCH is refunded.
 * The frontend only ever displays this result (via the quote endpoint); the cancel
 * endpoint re-runs it, so a manipulated request can never grant a better refund.
 *
 * Rules:
 *  - only CONFIRMED bookings of events that have not started
 *  - the event's policy must allow cancellation
 *  - refund % comes from the best tier the user still qualifies for
 *    (tiers: [{hoursBefore: 72, refundPercent: 100}, {hoursBefore: 24, refundPercent: 50}])
 *  - convenience fee and its tax are non-refundable
 *  - no cancellation once any ticket has been scanned at the gate
 */
export function evaluateCancellation({ booking, event, ticketsUsed = 0, now = new Date() }) {
  const deny = (reason) => ({ allowed: false, reason, refundPercent: 0, refundAmount: 0 });

  if (booking.status !== BOOKING_STATUS.CONFIRMED) return deny('Only confirmed bookings can be cancelled');
  if (event.status === EVENT_STATUS.CANCELLED) return deny('This event was cancelled - your refund is processed automatically');
  if (event.startsAt <= now) return deny('This event has already started');
  if (ticketsUsed > 0) return deny('Tickets from this booking have already been used');

  const policy = event.policies?.cancellation;
  if (!policy?.allowed) return deny('The organizer does not allow cancellations for this event');

  const hoursLeft = (event.startsAt.getTime() - now.getTime()) / 3_600_000;
  const tiers = [...(policy.tiers || [])].sort((a, b) => b.hoursBefore - a.hoursBefore);
  const tier = tiers.find((t) => hoursLeft >= t.hoursBefore);
  if (!tier || tier.refundPercent <= 0) return deny('The cancellation window for this event has closed');

  const refundableBase = booking.pricing.subtotal - (booking.pricing.discount || 0);
  const refundAmount = Math.round((refundableBase * tier.refundPercent) / 100);
  const nextTier = tiers.find((t) => t.hoursBefore < tier.hoursBefore);

  return {
    allowed: true,
    refundPercent: tier.refundPercent,
    refundAmount,
    nonRefundable: booking.pricing.total - refundAmount,
    reason: `Cancelling ${Math.floor(hoursLeft)}h before the event qualifies for a ${tier.refundPercent}% refund of the ticket price`,
    // When the refund percentage will drop next - useful to show in the UI.
    changesAt: new Date(event.startsAt.getTime() - tier.hoursBefore * 3_600_000),
    nextRefundPercent: nextTier?.refundPercent ?? 0,
  };
}
