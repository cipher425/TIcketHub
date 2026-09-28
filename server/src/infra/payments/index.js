import { env } from '../../config/env.js';
import { createRazorpayProvider } from './razorpayProvider.js';
import { createMockProvider } from './mockProvider.js';

/**
 * PaymentProvider interface (every provider implements these):
 *   publicConfig() -> { provider, keyId }
 *   createOrder({ amount, currency, receipt, notes }) -> { orderId, amount, currency }
 *   verifyPaymentSignature({ orderId, paymentId, signature }) -> boolean
 *   verifyWebhookSignature(rawBody, signature) -> boolean
 *   ensureCaptured({ paymentId, amount, currency }) -> { status, amount }
 *   fetchOrderPayments(orderId) -> [{ id, status, amount }]
 *   refund({ paymentId, amount, notes }) -> { refundId, status }
 */
let provider = null;

export function getPaymentProvider() {
  if (!provider) provider = env.PAYMENT_PROVIDER === 'razorpay' ? createRazorpayProvider() : createMockProvider();
  return provider;
}
