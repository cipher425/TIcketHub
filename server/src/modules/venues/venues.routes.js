import { Router } from 'express';
import { z } from 'zod';
import * as venuesService from './venues.service.js';
import { LIMITS } from './layoutGenerator.js';
import { validate } from '../../middleware/validate.js';
import { created, idParams, ok } from '../../utils/http.js';

// Mounted under /organizer/venues (auth + ORGANIZER/ADMIN role already enforced by the parent router).
const router = Router();

const layoutSpecSchema = z.object({
  stageLabel: z.string().trim().max(30).optional(),
  sections: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        rows: z.coerce.number().int().min(1).max(LIMITS.rowsPerSection),
        seatsPerRow: z.coerce.number().int().min(1).max(LIMITS.seatsPerRow),
        aisleAfter: z.array(z.coerce.number().int().min(1)).max(10).default([]),
      })
    )
    .min(1)
    .max(LIMITS.sections),
});

const venueSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(60),
  layoutSpec: layoutSpecSchema,
});

router.get('/', async (req, res) => ok(res, await venuesService.listVenues(req.user)));

router.post('/layout-preview', validate({ body: layoutSpecSchema }), (req, res) =>
  ok(res, venuesService.previewLayout(req.valid.body))
);

router.post('/', validate({ body: venueSchema }), async (req, res) =>
  created(res, await venuesService.createVenue(req.user, req.valid.body))
);

router.get('/:id', validate({ params: idParams }), async (req, res) =>
  ok(res, await venuesService.getOwnedVenue(req.valid.params.id, req.user))
);

router.patch('/:id', validate({ params: idParams, body: venueSchema.partial() }), async (req, res) =>
  ok(res, await venuesService.updateVenue(req.valid.params.id, req.user, req.valid.body))
);

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await venuesService.deleteVenue(req.valid.params.id, req.user);
  ok(res, { deleted: true });
});

export default router;
