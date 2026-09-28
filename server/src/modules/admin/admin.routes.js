import { Router } from 'express';
import { z } from 'zod';
import * as adminService from './admin.service.js';
import { platformStats } from '../analytics/analytics.service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { EVENT_STATUS, MODERATION, ORGANIZER_STATUS, ROLES, USER_STATUS } from '../../config/constants.js';
import { idParams, ok, paginationQuery } from '../../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/stats', async (_req, res) => ok(res, await platformStats()));

router.get(
  '/users',
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      role: z.enum(Object.values(ROLES)).optional(),
      status: z.enum(Object.values(USER_STATUS)).optional(),
      ...paginationQuery,
    }),
  }),
  async (req, res) => {
    const { items, meta } = await adminService.listUsers(req.valid.query);
    ok(res, items, meta);
  }
);

router.patch(
  '/users/:id',
  validate({
    params: idParams,
    body: z.object({ status: z.enum(Object.values(USER_STATUS)).optional(), role: z.enum(Object.values(ROLES)).optional() }),
  }),
  async (req, res) => ok(res, await adminService.updateUser(req.user.id, req.valid.params.id, req.valid.body))
);

router.get(
  '/organizer-applications',
  validate({ query: z.object({ status: z.enum(Object.values(ORGANIZER_STATUS)).optional(), ...paginationQuery }) }),
  async (req, res) => {
    const { items, meta } = await adminService.listOrganizerApplications(req.valid.query);
    ok(res, items, meta);
  }
);

router.post(
  '/organizer-applications/:id/:decision',
  validate({
    params: idParams.extend({ decision: z.enum(['approve', 'reject']) }),
    body: z.object({ reason: z.string().trim().max(500).optional() }),
  }),
  async (req, res) => {
    const { id, decision } = req.valid.params;
    ok(res, await adminService.reviewOrganizer(req.user.id, id, { approve: decision === 'approve', reason: req.valid.body.reason }));
  }
);

router.get(
  '/events',
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      status: z.enum(Object.values(EVENT_STATUS)).optional(),
      moderation: z.enum(Object.values(MODERATION)).optional(),
      ...paginationQuery,
    }),
  }),
  async (req, res) => {
    const { items, meta } = await adminService.listEvents(req.valid.query);
    ok(res, items, meta);
  }
);

router.post(
  '/events/:id/moderate',
  validate({
    params: idParams,
    body: z.object({
      action: z.enum(['suspend', 'restore', 'feature', 'unfeature', 'high-demand-on', 'high-demand-off']),
      reason: z.string().trim().max(300).optional(),
    }),
  }),
  async (req, res) => ok(res, await adminService.moderateEvent(req.valid.params.id, req.valid.body))
);

export default router;
