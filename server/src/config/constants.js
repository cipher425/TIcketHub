// Single source of truth for every enum used by the API.

export const ROLES = Object.freeze({ USER: 'USER', ORGANIZER: 'ORGANIZER', ADMIN: 'ADMIN' });

export const USER_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' });

export const ORGANIZER_STATUS = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

export const EVENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  UNPUBLISHED: 'UNPUBLISHED',
  CANCELLED: 'CANCELLED',
});

export const MODERATION = Object.freeze({ ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' });

export const SEAT_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  BOOKED: 'BOOKED',
  BLOCKED: 'BLOCKED',
});

// Compact codes sent to the browser in availability payloads.
export const SEAT_CODE = Object.freeze({ AVAILABLE: 'A', HELD: 'H', BOOKED: 'B', BLOCKED: 'X' });

export const BOOKING_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  RELEASED: 'RELEASED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

export const ACTIVE_BOOKING_STATUSES = [BOOKING_STATUS.PENDING, BOOKING_STATUS.PAYMENT_PROCESSING];

export const PAYMENT_STATUS = Object.freeze({
  CREATED: 'CREATED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
});

export const TICKET_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', USED: 'USED', CANCELLED: 'CANCELLED' });

export const CHECKIN_RESULT = Object.freeze({
  VALID: 'VALID',
  ALREADY_USED: 'ALREADY_USED',
  INVALID: 'INVALID',
  WRONG_EVENT: 'WRONG_EVENT',
  CANCELLED: 'CANCELLED',
});

export const NOTIFICATION_TYPE = Object.freeze({
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_FAILED: 'BOOKING_FAILED',
  EVENT_REMINDER: 'EVENT_REMINDER',
  EVENT_CANCELLED: 'EVENT_CANCELLED',
  ORGANIZER_APPROVED: 'ORGANIZER_APPROVED',
  ORGANIZER_REJECTED: 'ORGANIZER_REJECTED',
});

export const EVENT_CATEGORIES = Object.freeze([
  'Music',
  'Comedy',
  'Theatre',
  'Sports',
  'Conference',
  'Workshop',
  'Festival',
  'Kids',
]);

// Names of in-process domain events (later: queue topics).
export const DOMAIN_EVENTS = Object.freeze({
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_FAILED: 'booking.failed',
  BOOKING_UPDATED: 'booking.updated',
  SEATS_CHANGED: 'seats.changed',
  EVENT_CANCELLED: 'event.cancelled',
  ORGANIZER_REVIEWED: 'organizer.reviewed',
});

// Names of background jobs (inline now, BullMQ in Stage 3).
export const JOBS = Object.freeze({
  SWEEP_HOLDS: 'holds.sweep',
  RETRY_REFUNDS: 'refunds.retry',
  EVENT_REMINDERS: 'events.reminders',
  SEND_NOTIFICATION: 'notification.send',
  PROCESS_EVENT_CANCELLATION: 'event.cancellation.process',
  WAITING_ROOM_ADMIT: 'waitingroom.admit',
});
