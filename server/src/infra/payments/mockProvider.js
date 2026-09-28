import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * A stateless fake payment gateway that behaves like Razorpay:
 * orders, HMAC signatures, refunds. Used for local development without an account,
 * automated tests and load tests (you must never load-test a real gateway sandbox).
 */
const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', env.MOCK_PAYMENT_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const id = (prefix) => `${prefix}_mock_${crypto.randomBytes(9).toString('base64url')}`;

export function createMockProvider() {
  return {
    name: 'mock',

    publicConfig() {
      return { provider: 'mock', keyId: null };
    },

    async createOrder({ amount, currency }) {
      return { orderId: id('order'), amount, currency };
    },

    verifyPaymentSignature({ orderId, paymentId, signature }) {
      const expected = sign(orderId, paymentId);
      return (
        typeof signature === 'string' &&
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      );
    },

    verifyWebhookSignature() {
      return false; // the mock gateway never sends webhooks
    },

    async ensureCaptured({ amount }) {
      return { status: 'captured', amount };
    },

    async fetchOrderPayments() {
      return [];
    },

    async refund() {
      return { refundId: id('rfnd'), status: 'processed' };
    },

    /** Simulates the hosted checkout: returns what Razorpay's handler() would receive. */
    simulateCheckout({ orderId, outcome }) {
      if (outcome !== 'success') {
        return { ok: false, error: { code: 'BAD_REQUEST_ERROR', description: 'Payment declined by mock bank' } };
      }
      const paymentId = id('pay');
      return {
        ok: true,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: sign(orderId, paymentId),
      };
    },
  };
}
