import crypto from 'node:crypto';
import { BOOKING_STATUS as S, PAYMENT_STATUS } from '../../config/constants.js';
import { Payment } from './payment.model.js';
import { WebhookEvent } from './webhookEvent.model.js';
import { processRefund, requestRefund } from './refunds.service.js';
import { confirmBooking, extendHoldForPayment, getOwnedBooking } from '../bookings/bookings.service.js';
import { transition } from '../bookings/bookingStateMachine.js';
import { Booking } from '../bookings/booking.model.js';
import { User } from '../users/user.model.js';
import { getPaymentProvider } from '../../infra/payments/index.js';
import { logger } from '../../infra/logger.js';
import { badRequest, conflict, gone, notFound } from '../../utils/AppError.js';

const ORDER_REUSE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Flow:  browser -> POST /bookings/:id/payment-order  (we create the gateway order for OUR price)
 *        browser -> Razorpay checkout -> handler(response)
 *        browser -> POST /payments/verify              (we check the HMAC signature)
 *        Razorpay -> POST /payments/webhooks/razorpay   (safety net if the tab was closed)
 * Both verify and webhook end in handleCapturedPayment(), which is idempotent.
 */
export async function createPaymentOrder(user, bookingId) {
  let booking = await getOwnedBooking(bookingId, user);
  if (booking.status === S.CONFIRMED) throw conflict('This booking is already paid', undefined, 'ALREADY_PAID');
  if (![S.PENDING, S.PAYMENT_PROCESSING].includes(booking.status) || booking.holdExpiresAt <= new Date()) {
    throw gone('Your seat hold has expired. Please select your seats again.', 'HOLD_EXPIRED');
  }

  const provider = getPaymentProvider();
  // Double-click / page refresh: reuse the open order instead of creating a new one.
  let payment = await Payment.findOne({
    booking: booking._id,
    status: PAYMENT_STATUS.CREATED,
    amount: booking.pricing.total,
    createdAt: { $gt: new Date(Date.now() - ORDER_REUSE_WINDOW_MS) },
  });
  if (!payment) {
    const order = await provider.createOrder({
      amount: booking.pricing.total,
      currency: booking.pricing.currency,
      receipt: booking.bookingRef,
      notes: { bookingId: String(booking._id), bookingRef: booking.bookingRef },
    });
    payment = await Payment.create({
      booking: booking._id,
      user: booking.user,
      provider: provider.name,
      providerOrderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
    });
  }

  booking = await extendHoldForPayment(booking);
  if (booking.status === S.PENDING) {
    ({ booking } = await transition(booking._id, S.PAYMENT_PROCESSING, { from: S.PENDING, actor: 'user', reason: 'Payment started' }));
  }

  const customer = await User.findById(booking.user).select('name email phone').lean();
  return {
    ...provider.publicConfig(),
    paymentId: String(payment._id),
    orderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    bookingId: String(booking._id),
    bookingRef: booking.bookingRef,
    holdExpiresAt: booking.holdExpiresAt,
    description: `${booking.eventTitle} - ${booking.items.map((i) => i.label).join(', ')}`,
    prefill: { name: customer?.name, email: customer?.email, contact: customer?.phone },
  };
}

async function refundWholePayment(payment, reason) {
  await requestRefund(payment._id, payment.amount, reason);
  await processRefund(payment._id);
}

/** The single place where a successful payment is applied. Safe to call many times. */
export async function handleCapturedPayment(payment, providerPaymentId, actor) {
  const result = await confirmBooking(payment.booking, { paymentId: payment._id, providerPaymentId, actor });
  if (result.outcome === 'SEATS_LOST') {
    await refundWholePayment(payment, 'Seats unavailable when payment completed');
  } else if (result.outcome === 'DUPLICATE_PAYMENT') {
    logger.warn({ bookingId: String(payment.booking), paymentId: String(payment._id) }, 'Duplicate payment detected, refunding');
    await refundWholePayment(payment, 'Duplicate payment for an already settled booking');
  }
  return result;
}

export async function verifyPayment(user, { orderId, paymentId, signature }) {
  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment || String(payment.user) !== user.id) throw notFound('Payment');

  const provider = getPaymentProvider();
  if (!provider.verifyPaymentSignature({ orderId, paymentId, signature })) {
    throw badRequest('Payment signature verification failed', undefined, 'INVALID_SIGNATURE');
  }
  const captured = await provider.ensureCaptured({ paymentId, amount: payment.amount, currency: payment.currency });
  if (captured.status !== 'captured') throw conflict('Payment is not captured yet, please wait', undefined, 'PAYMENT_NOT_CAPTURED');
  if (captured.amount !== payment.amount) throw conflict('Payment amount mismatch', undefined, 'AMOUNT_MISMATCH');

  const { outcome, booking } = await handleCapturedPayment(payment, paymentId, 'user');
  return { outcome, booking };
}

/** The browser tells us the payment failed / was cancelled. Informational only - it cannot confirm anything. */
export async function reportPaymentFailure(user, { orderId, reason }) {
  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment || String(payment.user) !== user.id) throw notFound('Payment');
  return markPaymentFailed(payment, reason || 'Payment was not completed', 'user');
}

async function markPaymentFailed(payment, reason, actor) {
  await Payment.updateOne({ _id: payment._id, status: PAYMENT_STATUS.CREATED }, { $set: { status: PAYMENT_STATUS.FAILED, failureReason: reason } });
  const booking = await Booking.findById(payment.booking);
  if (booking?.status === S.PAYMENT_PROCESSING) {
    try {
      // Back to PENDING: the user can retry while the hold is still valid.
      await transition(booking._id, S.PENDING, { from: S.PAYMENT_PROCESSING, actor, reason: `Payment failed: ${reason}` });
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  }
  return Booking.findById(payment.booking);
}

export async function handleWebhook({ rawBody, signature, eventIdHeader }) {
  const provider = getPaymentProvider();
  if (!provider.verifyWebhookSignature(rawBody, signature)) throw badRequest('Invalid webhook signature', undefined, 'INVALID_SIGNATURE');

  const body = JSON.parse(rawBody.toString('utf8'));
  const eventId = eventIdHeader || crypto.createHash('sha256').update(rawBody).digest('hex');

  const seen = await WebhookEvent.findOneAndUpdate(
    { eventId },
    { $setOnInsert: { provider: provider.name, type: body.event } },
    { upsert: true, new: false }
  );
  if (seen?.processedAt) return { duplicate: true };

  try {
    const paymentEntity = body.payload?.payment?.entity;
    switch (body.event) {
      case 'payment.captured':
      case 'order.paid': {
        const payment = await Payment.findOne({ providerOrderId: paymentEntity?.order_id });
        if (payment) await handleCapturedPayment(payment, paymentEntity.id, 'webhook');
        break;
      }
      case 'payment.failed': {
        const payment = await Payment.findOne({ providerOrderId: paymentEntity?.order_id });
        if (payment) await markPaymentFailed(payment, paymentEntity.error_description || 'Payment failed', 'webhook');
        break;
      }
      case 'refund.processed': {
        const refund = body.payload?.refund?.entity;
        await Payment.updateOne(
          { providerPaymentId: refund?.payment_id, status: PAYMENT_STATUS.REFUND_PENDING },
          { $set: { status: PAYMENT_STATUS.REFUNDED, 'refund.id': refund.id, 'refund.status': 'processed', 'refund.processedAt': new Date() } }
        );
        break;
      }
      default:
        break;
    }
    await WebhookEvent.updateOne({ eventId }, { $set: { processedAt: new Date() } });
  } catch (err) {
    await WebhookEvent.updateOne({ eventId }, { $set: { error: err.message } });
    throw err; // non-2xx -> Razorpay retries later
  }
  return { processed: true };
}

/**
 * Before the sweeper expires a booking stuck in PAYMENT_PROCESSING, ask the gateway whether
 * money actually arrived (lost webhook, closed tab). Returns true if the booking got confirmed.
 */
export async function reconcileBooking(bookingId) {
  const provider = getPaymentProvider();
  const payments = await Payment.find({ booking: bookingId, status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.FAILED] } });
  for (const payment of payments) {
    const remote = await provider.fetchOrderPayments(payment.providerOrderId);
    const captured = remote.find((p) => p.status === 'captured');
    if (captured) {
      const { outcome } = await handleCapturedPayment(payment, captured.id, 'reconciler');
      return outcome === 'CONFIRMED';
    }
  }
  return false;
}
