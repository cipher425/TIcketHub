import { Router } from 'express';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import eventsRoutes, { catalogRouter } from './modules/events/events.routes.js';
import organizerRoutes from './modules/events/organizer.routes.js';
import bookingsRoutes from './modules/bookings/bookings.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import ticketsRoutes from './modules/tickets/tickets.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import waitingRoomRoutes from './modules/waitingRoom/waitingRoom.routes.js';

const router = Router();

/** Public runtime config the frontend needs (feature flags, payment key). No secrets here. */
router.get('/config', (_req, res) =>
  res.json({
    data: {
      paymentProvider: env.PAYMENT_PROVIDER,
      razorpayKeyId: env.PAYMENT_PROVIDER === 'razorpay' ? env.RAZORPAY_KEY_ID : null,
      holdDurationSeconds: env.HOLD_DURATION_SECONDS,
      maxSeatsPerBooking: env.MAX_SEATS_PER_BOOKING,
      realtimeEnabled: env.REALTIME_ENABLED,
      waitingRoomEnabled: env.WAITING_ROOM_ENABLED,
    },
  })
);

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/catalog', catalogRouter);
router.use('/events', eventsRoutes);
router.use('/waiting-room', waitingRoomRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/organizer', organizerRoutes);
router.use('/admin', adminRoutes);

export default router;
