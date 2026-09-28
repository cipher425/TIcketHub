import { Router } from 'express';
import * as ctrl from './events.controller.js';
import { listEventsQuery } from './events.validators.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/http.js';
import { EVENT_CATEGORIES } from '../../config/constants.js';

/** Public discovery API: never returns drafts, unpublished or suspended events. */
const router = Router();

router.get('/', validate({ query: listEventsQuery }), ctrl.list);
router.get('/:id/seat-layout', validate({ params: idParams }), ctrl.seatLayout);
router.get('/:id/seat-availability', validate({ params: idParams }), ctrl.seatAvailability);
router.get('/:idOrSlug', ctrl.details);

export default router;

export const catalogRouter = Router();
catalogRouter.get('/home', ctrl.home);
catalogRouter.get('/cities', ctrl.cities);
catalogRouter.get('/categories', (_req, res) => res.json({ data: EVENT_CATEGORIES }));
