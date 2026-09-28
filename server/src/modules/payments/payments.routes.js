import { Router } from 'express';
import { z } from 'zod';
import * as paymentsService from './payments.service.js';
import { getPaymentProvider } from '../../infra/payments/index.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { ok } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

const router = Router();

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

const failureSchema = z.object({ orderId: z.string().min(1).max(100), reason: z.string().max(300).optional() });

router.get('/config', (_req, res) => ok(res, getPaymentProvider().publicConfig()));

router.post('/verify', requireAuth, validate({ body: verifySchema }), async (req, res) => {
  const b = req.valid.body;
  const result = await paymentsService.verifyPayment(req.user, {
    orderId: b.razorpay_order_id,
    paymentId: b.razorpay_payment_id,
    signature: b.razorpay_signature,
  });
  ok(res, result);
});

router.post('/failure', requireAuth, validate({ body: failureSchema }), async (req, res) => {
  ok(res, await paymentsService.reportPaymentFailure(req.user, req.valid.body));
});

// Development/load-test only: stands in for Razorpay's hosted checkout.
router.post(
  '/mock/checkout',
  requireAuth,
  validate({ body: z.object({ orderId: z.string().min(1), outcome: z.enum(['success', 'failure']) }) }),
  (req, res) => {
    if (env.PAYMENT_PROVIDER !== 'mock') throw notFound('Route');
    ok(res, getPaymentProvider().simulateCheckout(req.valid.body));
  }
);

export default router;

/** Mounted separately in app.js with express.raw(): the signature is computed over the raw bytes. */
export async function razorpayWebhookHandler(req, res) {
  const result = await paymentsService.handleWebhook({
    rawBody: req.body,
    signature: req.get('x-razorpay-signature'),
    eventIdHeader: req.get('x-razorpay-event-id'),
  });
  res.json({ ok: true, ...result });
}
