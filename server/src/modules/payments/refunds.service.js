import { Payment } from './payment.model.js';
import { PAYMENT_STATUS } from '../../config/constants.js';
import { getPaymentProvider } from '../../infra/payments/index.js';
import { logger } from '../../infra/logger.js';

const MAX_ATTEMPTS = 5;

/**
 * Step 1 (inside the caller's DB transaction): record that money is owed back.
 * Step 2 (after commit): talk to the gateway. If the gateway is down, the booking is still
 * cancelled correctly and the refunds.retry job keeps trying - DB state never depends on
 * an external HTTP call succeeding.
 */
export async function requestRefund(paymentId, amount, reason, session) {
  await Payment.updateOne(
    { _id: paymentId, status: PAYMENT_STATUS.CAPTURED },
    { $set: { status: PAYMENT_STATUS.REFUND_PENDING, refund: { amount, reason, requestedAt: new Date(), attempts: 0 } } },
    { session }
  );
}

export async function processRefund(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment || payment.status !== PAYMENT_STATUS.REFUND_PENDING) return payment;
  try {
    const result = await getPaymentProvider().refund({
      paymentId: payment.providerPaymentId,
      amount: payment.refund.amount,
      notes: { reason: payment.refund.reason?.slice(0, 200), booking: String(payment.booking) },
    });
    payment.status = PAYMENT_STATUS.REFUNDED;
    payment.refund.id = result.refundId;
    payment.refund.status = result.status;
    payment.refund.processedAt = new Date();
  } catch (err) {
    payment.refund.attempts = (payment.refund.attempts || 0) + 1;
    payment.refund.lastError = err?.error?.description || err.message;
    logger.warn({ err, paymentId: String(payment._id) }, 'Refund attempt failed, will retry');
  }
  await payment.save();
  return payment;
}

export async function retryPendingRefunds() {
  const pending = await Payment.find({
    status: PAYMENT_STATUS.REFUND_PENDING,
    'refund.attempts': { $lt: MAX_ATTEMPTS },
  })
    .select('_id')
    .limit(50)
    .lean();
  for (const p of pending) await processRefund(p._id);
  return pending.length;
}
