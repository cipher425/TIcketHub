import { Router } from 'express';
import * as wr from './waitingRoom.service.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { idParams, ok } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

const router = Router();

router.use(requireAuth, (_req, _res, next) => {
  if (!env.WAITING_ROOM_ENABLED) throw notFound('Waiting room');
  next();
});

router.post('/:id/join', validate({ params: idParams }), async (req, res) => ok(res, await wr.join(req.user.id, req.valid.params.id)));
router.get('/:id/status', validate({ params: idParams }), async (req, res) => ok(res, await wr.getStatus(req.user.id, req.valid.params.id)));
router.post('/:id/leave', validate({ params: idParams }), async (req, res) => {
  await wr.leave(req.user.id, req.valid.params.id);
  ok(res, { left: true });
});

export default router;
