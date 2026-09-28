import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from './events.controller.js';
import {
  cancelEventSchema,
  createEventSchema,
  organizerEventsQuery,
  seatingSchema,
  ticketTypesSchema,
  updateEventSchema,
} from './events.validators.js';
import venuesRouter from '../venues/venues.routes.js';
import { listOrganizerBookings, organizerOverview } from '../analytics/analytics.service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { BOOKING_STATUS, ROLES } from '../../config/constants.js';
import { idParams, objectId, ok, paginationQuery } from '../../utils/http.js';

/**
 * Everything under /organizer requires an ORGANIZER (or ADMIN) - enforced here on the server,
 * so hiding buttons in the UI is only cosmetic. Ownership of each event/venue is then checked
 * inside the services (an organizer can never touch another organizer's data).
 */
const router = Router();
router.use(requireAuth, requireRole(ROLES.ORGANIZER, ROLES.ADMIN));

router.use('/venues', venuesRouter);

router.get('/overview', async (req, res) => ok(res, await organizerOverview(req.user.id)));

router.get(
  '/bookings',
  validate({
    query: z.object({
      eventId: objectId.optional(),
      status: z.enum([BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.FAILED]).optional(),
      q: z.string().trim().max(20).optional(),
      ...paginationQuery,
    }),
  }),
  async (req, res) => {
    const { items, meta } = await listOrganizerBookings(req.user, req.valid.query);
    ok(res, items, meta);
  }
);

const codeBody = z.object({ code: z.string().trim().min(1).max(200) });

router.get('/events', validate({ query: organizerEventsQuery }), ctrl.orgList);
router.post('/events', validate({ body: createEventSchema }), ctrl.orgCreate);
router.get('/events/:id', validate({ params: idParams }), ctrl.orgGet);
router.patch('/events/:id', validate({ params: idParams, body: updateEventSchema }), ctrl.orgUpdate);
router.delete('/events/:id', validate({ params: idParams }), ctrl.orgDelete);
router.put('/events/:id/ticket-types', validate({ params: idParams, body: ticketTypesSchema }), ctrl.orgTicketTypes);
router.get('/events/:id/seat-map', validate({ params: idParams }), ctrl.orgSeatMap);
router.put('/events/:id/seating', validate({ params: idParams, body: seatingSchema }), ctrl.orgSeating);
router.post('/events/:id/publish', validate({ params: idParams }), ctrl.orgPublish);
router.post('/events/:id/unpublish', validate({ params: idParams }), ctrl.orgUnpublish);
router.post('/events/:id/cancel', validate({ params: idParams, body: cancelEventSchema }), ctrl.orgCancel);
router.get('/events/:id/analytics', validate({ params: idParams }), ctrl.orgAnalytics);
router.post('/events/:id/check-ins/verify', validate({ params: idParams, body: codeBody }), ctrl.orgVerifyTicket);
router.post('/events/:id/check-ins', validate({ params: idParams, body: codeBody }), ctrl.orgCheckIn);

export default router;
