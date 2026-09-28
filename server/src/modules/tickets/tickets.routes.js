import { Router } from 'express';
import { z } from 'zod';
import * as ticketsService from './tickets.service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { idParams, ok } from '../../utils/http.js';

const router = Router();
router.use(requireAuth);

const listSchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/', validate({ query: listSchema }), async (req, res) => {
  const { items, meta } = await ticketsService.listMyTickets(req.user, req.valid.query);
  ok(res, items, meta);
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  ok(res, await ticketsService.getTicket(req.valid.params.id, req.user));
});

export default router;
