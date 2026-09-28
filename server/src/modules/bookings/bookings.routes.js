import { Router } from 'express';
import { z } from 'zod';
import * as bookingsService from './bookings.service.js';
import { listBookingTickets } from '../tickets/tickets.service.js';
import { createPaymentOrder } from '../payments/payments.service.js';
import { requireAdmission } from '../waitingRoom/waitingRoom.middleware.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { holdLimiter } from '../../middleware/rateLimits.js';
import { created, idParams, objectId, ok, paginationQuery } from '../../utils/http.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  eventId: objectId,
  seatIds: z.array(objectId).min(1, 'Select at least one seat').max(10),
  couponCode: z.string().trim().max(30).optional(),
});

const listSchema = z.object({ scope: z.enum(['upcoming', 'past', 'active']).default('upcoming'), ...paginationQuery });
const couponSchema = z.object({ code: z.string().trim().max(30).nullable() });
const cancelSchema = z.object({ reason: z.string().trim().max(300).default('Cancelled by customer') });

const serverMeta = () => ({ serverTime: new Date().toISOString() });

// POST /bookings -> hold seats and create a PENDING booking
router.post('/', holdLimiter, validate({ body: createSchema }), requireAdmission, async (req, res) => {
  const booking = await bookingsService.createHold(req.user, req.valid.body);
  res.status(201).json({ data: booking, meta: serverMeta() });
});

router.get('/', validate({ query: listSchema }), async (req, res) => {
  const { items, meta } = await bookingsService.listMyBookings(req.user, req.valid.query);
  ok(res, items, meta);
});

router.get('/active', validate({ query: z.object({ eventId: objectId }) }), async (req, res) => {
  ok(res, await bookingsService.getActiveHold(req.user, req.valid.query.eventId), serverMeta());
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  ok(res, await bookingsService.getBookingDetails(req.user, req.valid.params.id), serverMeta());
});

router.get('/:id/tickets', validate({ params: idParams }), async (req, res) => {
  const booking = await bookingsService.getOwnedBooking(req.valid.params.id, req.user);
  ok(res, await listBookingTickets(booking._id));
});

router.post('/:id/release', validate({ params: idParams }), async (req, res) => {
  ok(res, await bookingsService.releaseHold(req.user, req.valid.params.id));
});

router.patch('/:id/coupon', validate({ params: idParams, body: couponSchema }), async (req, res) => {
  ok(res, await bookingsService.applyCoupon(req.user, req.valid.params.id, req.valid.body.code), serverMeta());
});

router.post('/:id/payment-order', validate({ params: idParams }), async (req, res) => {
  created(res, await createPaymentOrder(req.user, req.valid.params.id));
});

router.get('/:id/cancellation-quote', validate({ params: idParams }), async (req, res) => {
  ok(res, await bookingsService.getCancellationQuote(req.user, req.valid.params.id));
});

router.post('/:id/cancel', validate({ params: idParams, body: cancelSchema }), async (req, res) => {
  ok(res, await bookingsService.cancelBooking(req.valid.params.id, { user: req.user, reason: req.valid.body.reason }));
});

export default router;
