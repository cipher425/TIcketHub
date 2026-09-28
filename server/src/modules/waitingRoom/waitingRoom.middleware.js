import { env } from '../../config/env.js';
import { Event } from '../events/event.model.js';
import { verifyAdmission } from './waitingRoom.service.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Guards the seat-hold endpoint for events flagged `highDemand`.
 * Without a valid admission token from the waiting room, the request is rejected before it
 * ever touches the seat inventory. No-op when WAITING_ROOM_ENABLED=false (Stage 1).
 */
export async function requireAdmission(req, _res, next) {
  if (!env.WAITING_ROOM_ENABLED) return next();
  const eventId = req.valid?.body?.eventId;
  const event = await Event.findById(eventId).select('highDemand').lean();
  if (!event?.highDemand) return next();
  const token = req.get('x-admission-token');
  if (!token || !verifyAdmission(token, req.user.id, eventId)) {
    throw new AppError(403, 'ADMISSION_REQUIRED', 'Please join the waiting room for this event first', { eventId });
  }
  next();
}
