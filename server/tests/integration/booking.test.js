import { describe, expect, it } from 'vitest';
import { makePublishedEvent, makeUser } from '../helpers.js';
import { cancelBooking, createHold, expireBooking, releaseHold } from '../../src/modules/bookings/bookings.service.js';
import { createPaymentOrder, verifyPayment } from '../../src/modules/payments/payments.service.js';
import { getPaymentProvider } from '../../src/infra/payments/index.js';
import { checkInTicket } from '../../src/modules/tickets/checkin.service.js';
import { Booking } from '../../src/modules/bookings/booking.model.js';
import { EventSeat } from '../../src/modules/seating/eventSeat.model.js';
import { Ticket } from '../../src/modules/tickets/ticket.model.js';
import { Payment } from '../../src/modules/payments/payment.model.js';
import { Event } from '../../src/modules/events/event.model.js';

async function payWithMock(user, bookingId) {
  const order = await createPaymentOrder(user, bookingId);
  const paid = getPaymentProvider().simulateCheckout({ orderId: order.orderId, outcome: 'success' });
  const input = { orderId: paid.razorpay_order_id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature };
  return { order, input, result: await verifyPayment(user, input) };
}

describe('seat holds', () => {
  it('only ONE of many concurrent buyers can hold the same seat', async () => {
    const { event, seats } = await makePublishedEvent();
    const buyers = await Promise.all(Array.from({ length: 30 }, () => makeUser()));
    const results = await Promise.allSettled(
      buyers.map(({ actor }) => createHold(actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] }))
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter((r) => r.status === 'rejected' && r.reason.code === 'SEATS_UNAVAILABLE');
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(29);
    expect(await Booking.countDocuments({ isActiveHold: true })).toBe(1);
  });

  it('is all-or-nothing for multi-seat holds', async () => {
    const { event, seats } = await makePublishedEvent();
    const a = await makeUser();
    const b = await makeUser();
    await createHold(a.actor, { eventId: String(event._id), seatIds: [String(seats[1]._id)] });
    await expect(
      createHold(b.actor, { eventId: String(event._id), seatIds: [String(seats[0]._id), String(seats[1]._id)] })
    ).rejects.toMatchObject({ code: 'SEATS_UNAVAILABLE' });
    // seat 0 must NOT stay held by b after the failed attempt
    const seat0 = await EventSeat.findById(seats[0]._id).lean();
    expect(seat0.status).toBe('AVAILABLE');
  });

  it('computes the price on the server and releases seats on release', async () => {
    const { event, seats } = await makePublishedEvent();
    const { actor } = await makeUser();
    const booking = await createHold(actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });
    expect(booking.pricing.subtotal).toBe(500_000); // VIP price from DB
    expect(booking.status).toBe('PENDING');
    await releaseHold(actor, booking._id);
    expect((await EventSeat.findById(seats[0]._id)).status).toBe('AVAILABLE');
  });

  it('treats an expired hold as free (lazy expiry) even before the sweeper runs', async () => {
    const { event, seats } = await makePublishedEvent();
    const a = await makeUser();
    const b = await makeUser();
    const booking = await createHold(a.actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });
    await EventSeat.updateOne({ _id: seats[0]._id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await Booking.updateOne({ _id: booking._id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const second = await createHold(b.actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });
    expect(second.status).toBe('PENDING');
    expect(await expireBooking(await Booking.findById(booking._id).lean())).toBe(true);
    // The expired booking's release must not free b's hold
    expect((await EventSeat.findById(seats[0]._id)).holdId.toString()).toBe(second._id.toString());
  });
});

describe('payment -> confirmation -> tickets -> check-in -> cancellation', () => {
  it('runs the complete happy path idempotently', async () => {
    const { event, seats, organizer } = await makePublishedEvent({
      cancellation: { allowed: true, tiers: [{ hoursBefore: 72, refundPercent: 100 }] },
    });
    const { actor } = await makeUser();
    const booking = await createHold(actor, { eventId: String(event._id), seatIds: [String(seats[0]._id), String(seats[1]._id)] });

    const { input, result } = await payWithMock(actor, booking._id);
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.booking.status).toBe('CONFIRMED');
    expect(await Ticket.countDocuments({ booking: booking._id })).toBe(2);
    expect((await Event.findById(event._id)).seatsSold).toBe(2);

    // Same payment verified again (e.g. webhook after the browser) -> no double processing
    const again = await verifyPayment(actor, input);
    expect(again.outcome).toBe('ALREADY_PROCESSED');
    expect(await Ticket.countDocuments({ booking: booking._id })).toBe(2);

    // Gate: first scan admits, second scan is rejected
    const ticket = await Ticket.findOne({ booking: booking._id }).lean();
    expect((await checkInTicket(event._id, `TH1.${ticket.ticketCode}`, organizer.id)).result).toBe('VALID');
    expect((await checkInTicket(event._id, ticket.ticketCode, organizer.id)).result).toBe('ALREADY_USED');

    // Used ticket -> cancellation must be refused by the backend
    await expect(cancelBooking(booking._id, { user: actor, reason: 'test' })).rejects.toMatchObject({ code: 'CANCELLATION_NOT_ALLOWED' });
  });

  it('cancels with a policy-based refund and reopens the seats', async () => {
    const { event, seats } = await makePublishedEvent({
      cancellation: { allowed: true, tiers: [{ hoursBefore: 72, refundPercent: 100 }] },
    });
    const { actor } = await makeUser();
    const booking = await createHold(actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });
    await payWithMock(actor, booking._id);

    const cancelled = await cancelBooking(booking._id, { user: actor, reason: 'Plans changed' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellation.refundAmount).toBe(500_000); // ticket price only; fees not refunded
    expect((await Payment.findOne({ booking: booking._id })).status).toBe('REFUNDED');
    expect((await EventSeat.findById(seats[0]._id)).status).toBe('AVAILABLE');
    expect(await Ticket.countDocuments({ booking: booking._id, status: 'CANCELLED' })).toBe(1);
  });

  it('fails and refunds a late payment whose seats were taken by someone else', async () => {
    const { event, seats } = await makePublishedEvent();
    const a = await makeUser();
    const b = await makeUser();
    const late = await createHold(a.actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });
    const order = await createPaymentOrder(a.actor, late._id);

    // a's hold lapses; b grabs the seat
    await EventSeat.updateOne({ _id: seats[0]._id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await createHold(b.actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });

    const paid = getPaymentProvider().simulateCheckout({ orderId: order.orderId, outcome: 'success' });
    const { outcome, booking } = await verifyPayment(a.actor, {
      orderId: paid.razorpay_order_id,
      paymentId: paid.razorpay_payment_id,
      signature: paid.razorpay_signature,
    });
    expect(outcome).toBe('SEATS_LOST');
    expect(booking.status).toBe('FAILED');
    expect((await Payment.findOne({ booking: late._id })).status).toBe('REFUNDED');
  });

  it('rejects a forged payment signature', async () => {
    const { event, seats } = await makePublishedEvent();
    const { actor } = await makeUser();
    const booking = await createHold(actor, { eventId: String(event._id), seatIds: [String(seats[0]._id)] });
    const order = await createPaymentOrder(actor, booking._id);
    await expect(
      verifyPayment(actor, { orderId: order.orderId, paymentId: 'pay_fake', signature: 'deadbeef' })
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });
});
