import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function createRazorpayProvider() {
  const client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });

  return {
    name: 'razorpay',

    publicConfig() {
      return { provider: 'razorpay', keyId: env.RAZORPAY_KEY_ID };
    },

    async createOrder({ amount, currency, receipt, notes }) {
      const order = await client.orders.create({ amount, currency, receipt, notes, payment_capture: 1 });
      return { orderId: order.id, amount: order.amount, currency: order.currency };
    },

    // Razorpay docs: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    verifyPaymentSignature({ orderId, paymentId, signature }) {
      const expected = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      return safeEqualHex(expected, signature);
    },

    // Webhook signature is HMAC_SHA256 of the RAW request body with the webhook secret.
    verifyWebhookSignature(rawBody, signature) {
      if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
      const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
      return safeEqualHex(expected, signature);
    },

    /** Makes sure an authorized payment is captured (in case auto-capture is off). */
    async ensureCaptured({ paymentId, amount, currency }) {
      const payment = await client.payments.fetch(paymentId);
      if (payment.status === 'authorized') {
        const captured = await client.payments.capture(paymentId, amount, currency);
        return { status: captured.status, amount: captured.amount };
      }
      return { status: payment.status, amount: payment.amount };
    },

    async fetchOrderPayments(orderId) {
      const res = await client.orders.fetchPayments(orderId);
      return (res.items || []).map((p) => ({ id: p.id, status: p.status, amount: p.amount }));
    },

    async refund({ paymentId, amount, notes }) {
      const refund = await client.payments.refund(paymentId, { amount, speed: 'normal', notes });
      return { refundId: refund.id, status: refund.status };
    },
  };
}
