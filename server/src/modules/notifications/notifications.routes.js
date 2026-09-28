import { Router } from 'express';
import { z } from 'zod';
import * as service from './notifications.service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { idParams, ok, paginationQuery } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: z.object(paginationQuery) }), async (req, res) => {
  const { items, meta } = await service.listNotifications(req.user.id, req.valid.query);
  ok(res, items, meta);
});

router.get('/unread-count', async (req, res) => ok(res, { count: await service.unreadCount(req.user.id) }));

router.patch('/:id/read', validate({ params: idParams }), async (req, res) => {
  const n = await service.markRead(req.user.id, req.valid.params.id);
  if (!n) throw notFound('Notification');
  ok(res, n);
});

router.post('/read-all', async (req, res) => {
  await service.markAllRead(req.user.id);
  ok(res, { done: true });
});

export default router;
