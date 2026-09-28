import { Router } from 'express';
import { z } from 'zod';
import * as usersService from './users.service.js';
import { password } from '../auth/auth.validators.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { ok } from '../../utils/http.js';

const router = Router();
router.use(requireAuth);

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, 'Enter a valid phone number').or(z.literal('')),
    city: z.string().trim().max(60),
  })
  .partial();

const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

const applicationSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20, 'Tell us a little more about the events you run').max(1000),
});

router.patch('/me', validate({ body: profileSchema }), async (req, res) => {
  ok(res, await usersService.updateProfile(req.user.id, req.valid.body));
});

router.patch('/me/password', validate({ body: passwordSchema }), async (req, res) => {
  await usersService.changePassword(req.user.id, req.valid.body);
  ok(res, { changed: true });
});

router.post('/me/organizer-application', validate({ body: applicationSchema }), async (req, res) => {
  ok(res, await usersService.applyForOrganizer(req.user.id, req.valid.body));
});

export default router;
