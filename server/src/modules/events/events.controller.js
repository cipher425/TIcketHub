import * as eventsService from './events.service.js';
import * as discovery from './discovery.service.js';
import { getAvailability, getSeatLayout } from '../seating/inventory.service.js';
import { eventAnalytics } from '../analytics/analytics.service.js';
import { checkInTicket, verifyTicket } from '../tickets/checkin.service.js';
import { created, ok } from '../../utils/http.js';

/* ---------- Public ---------- */

export async function home(req, res) {
  ok(res, await discovery.getHome(req.query.city ? String(req.query.city).slice(0, 60) : undefined));
}

export async function list(req, res) {
  const { items, meta } = await discovery.listEvents(req.valid.query);
  ok(res, items, meta);
}

export const cities = async (_req, res) => ok(res, await discovery.listCities());

export async function details(req, res) {
  ok(res, await discovery.getPublicEvent(req.params.idOrSlug));
}

export async function seatLayout(req, res) {
  await discovery.getVisibleEventOrThrow(req.valid.params.id);
  // Static data: let browsers/CDNs cache it briefly.
  res.set('Cache-Control', 'public, max-age=30');
  ok(res, await getSeatLayout(req.valid.params.id));
}

export async function seatAvailability(req, res) {
  await discovery.getVisibleEventOrThrow(req.valid.params.id);
  res.set('Cache-Control', 'no-store');
  ok(res, await getAvailability(req.valid.params.id));
}

/* ---------- Organizer ---------- */

export async function orgList(req, res) {
  const { items, meta } = await eventsService.listOrganizerEvents(req.user, req.valid.query);
  ok(res, items, meta);
}

export const orgCreate = async (req, res) => created(res, await eventsService.createEvent(req.user, req.valid.body));
export const orgGet = async (req, res) => ok(res, await eventsService.getOrganizerEvent(req.valid.params.id, req.user));
export const orgUpdate = async (req, res) => ok(res, await eventsService.updateEvent(req.valid.params.id, req.user, req.valid.body));

export async function orgDelete(req, res) {
  await eventsService.deleteEvent(req.valid.params.id, req.user);
  ok(res, { deleted: true });
}

export const orgTicketTypes = async (req, res) =>
  ok(res, await eventsService.setTicketTypes(req.valid.params.id, req.user, req.valid.body.ticketTypes));

export const orgSeatMap = async (req, res) => ok(res, await eventsService.getSeatMapForOrganizer(req.valid.params.id, req.user));

export const orgSeating = async (req, res) =>
  ok(res, await eventsService.updateSeating(req.valid.params.id, req.user, req.valid.body.blockedSeatLabels));

export const orgPublish = async (req, res) => ok(res, await eventsService.publishEvent(req.valid.params.id, req.user));
export const orgUnpublish = async (req, res) => ok(res, await eventsService.unpublishEvent(req.valid.params.id, req.user));
export const orgCancel = async (req, res) =>
  ok(res, await eventsService.cancelEvent(req.valid.params.id, req.user, req.valid.body.reason));

export async function orgAnalytics(req, res) {
  const event = await eventsService.getOwnedEvent(req.valid.params.id, req.user);
  ok(res, await eventAnalytics(event));
}

export async function orgVerifyTicket(req, res) {
  const event = await eventsService.getOwnedEvent(req.valid.params.id, req.user);
  ok(res, await verifyTicket(event._id, req.valid.body.code));
}

export async function orgCheckIn(req, res) {
  const event = await eventsService.getOwnedEvent(req.valid.params.id, req.user);
  ok(res, await checkInTicket(event._id, req.valid.body.code, req.user.id));
}
