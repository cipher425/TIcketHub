import { Event } from './event.model.js';
import { TicketType } from './ticketType.model.js';
import { Venue } from '../venues/venue.model.js';
import { getOwnedVenue } from '../venues/venues.service.js';
import { Booking } from '../bookings/booking.model.js';
import { generateInventory, getOrganizerSeatMap, layoutCacheKey, setBlockedSeats } from '../seating/inventory.service.js';
import { DOMAIN_EVENTS, EVENT_STATUS, JOBS, ROLES } from '../../config/constants.js';
import { withTransaction } from '../../infra/db/mongoose.js';
import { domainEvents } from '../../infra/events/domainEvents.js';
import { enqueue } from '../../infra/jobs/index.js';
import { cache } from '../../infra/cache.js';
import { randomCode, slugify } from '../../utils/codes.js';
import { pageMeta } from '../../utils/http.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';

const PALETTE = ['#f59e0b', '#8b5cf6', '#0ea5e9', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];

export async function getOwnedEvent(eventId, user) {
  const event = await Event.findById(eventId);
  if (!event) throw notFound('Event');
  if (user.role !== ROLES.ADMIN && String(event.organizer) !== user.id) throw forbidden('This event belongs to another organizer');
  return event;
}

function applyVenue(event, venue) {
  event.venue = venue._id;
  event.venueName = venue.name;
  event.address = venue.address;
  event.city = venue.city;
  event.cityKey = venue.city.toLowerCase();
}

export async function createEvent(user, data) {
  const venue = await getOwnedVenue(data.venueId, user);
  const { venueId: _v, ...fields } = data;
  const event = new Event({
    ...fields,
    organizer: user.id,
    slug: `${slugify(data.title)}-${randomCode(5).toLowerCase()}`,
  });
  applyVenue(event, venue);
  await event.save();
  return event;
}

export async function updateEvent(eventId, user, changes) {
  const event = await getOwnedEvent(eventId, user);
  if (event.status === EVENT_STATUS.CANCELLED) throw conflict('Cancelled events cannot be edited');

  if (changes.venueId && String(changes.venueId) !== String(event.venue)) {
    if (event.inventoryGeneratedAt) throw conflict('The venue cannot be changed after the event has been published');
    applyVenue(event, await getOwnedVenue(changes.venueId, user));
    await TicketType.updateMany({ event: event._id }, { $set: { sectionKeys: [] } }); // sections differ per venue
    event.blockedSeatLabels = [];
  }

  const { venueId: _v, policies, ...rest } = changes;
  const startsChanged = rest.startsAt && +rest.startsAt !== +event.startsAt;
  Object.assign(event, rest);
  if (policies) event.policies = { ...event.policies.toObject(), ...policies };
  if (event.endsAt <= event.startsAt) throw badRequest('End time must be after start time');

  await event.save();
  if (startsChanged) {
    // Keep the date snapshot on bookings in sync, and allow a fresh reminder.
    await Booking.updateMany({ event: event._id }, { $set: { eventStartsAt: event.startsAt } });
    await Event.updateOne({ _id: event._id }, { $unset: { reminderSentAt: 1 } });
  }
  return event;
}

/**
 * Replace the event's ticket categories.
 * Before first publish: anything goes. After publish the seat->category mapping is locked
 * (seats were already generated), but names/prices/colours can still change. Existing
 * bookings are unaffected because every booking stores a price snapshot.
 */
export async function setTicketTypes(eventId, user, list) {
  const event = await getOwnedEvent(eventId, user);
  if (event.status === EVENT_STATUS.CANCELLED) throw conflict('Cancelled events cannot be edited');
  const venue = await Venue.findById(event.venue).lean();
  const validKeys = new Set(venue.layout.sections.map((s) => s.key));

  const seen = new Set();
  for (const t of list) {
    for (const key of t.sectionKeys) {
      if (!validKeys.has(key)) throw badRequest(`Unknown section "${key}"`);
      if (seen.has(key)) throw badRequest(`Section "${key}" is assigned to more than one ticket type`);
      seen.add(key);
    }
  }

  const existing = await TicketType.find({ event: event._id }).lean();
  if (event.inventoryGeneratedAt) {
    const byId = new Map(existing.map((t) => [String(t._id), t]));
    const sameShape =
      list.length === existing.length &&
      list.every((t) => t.id && byId.has(t.id) && [...t.sectionKeys].sort().join() === [...byId.get(t.id).sectionKeys].sort().join());
    if (!sameShape) {
      throw conflict('Seating categories are locked after publishing. You can still change names, descriptions, colours and prices.');
    }
  }

  const keepIds = new Set(list.filter((t) => t.id).map((t) => t.id));
  await TicketType.deleteMany({ event: event._id, _id: { $nin: [...keepIds] } });
  await Promise.all(
    list.map((t, i) => {
      const doc = {
        name: t.name,
        description: t.description,
        price: t.price,
        color: t.color || PALETTE[i % PALETTE.length],
        sectionKeys: t.sectionKeys,
        sortOrder: i,
      };
      return t.id
        ? TicketType.updateOne({ _id: t.id, event: event._id }, { $set: doc })
        : TicketType.create({ ...doc, event: event._id });
    })
  );

  await refreshPriceRange(event);
  await cache.invalidate(layoutCacheKey(event._id));
  return TicketType.find({ event: event._id }).sort({ sortOrder: 1 }).lean();
}

async function refreshPriceRange(event) {
  const types = await TicketType.find({ event: event._id }).select('price').lean();
  const prices = types.map((t) => t.price);
  event.minPrice = prices.length ? Math.min(...prices) : 0;
  event.maxPrice = prices.length ? Math.max(...prices) : 0;
  await event.save();
}

export async function updateSeating(eventId, user, labels) {
  const event = await getOwnedEvent(eventId, user);
  return setBlockedSeats(event, labels);
}

export async function publishEvent(eventId, user) {
  const event = await getOwnedEvent(eventId, user);
  if (event.status === EVENT_STATUS.PUBLISHED) return event;
  if (event.status === EVENT_STATUS.CANCELLED) throw conflict('A cancelled event cannot be published');
  if (event.startsAt <= new Date()) throw badRequest('Cannot publish an event that has already started');

  const types = await TicketType.find({ event: event._id }).lean();
  if (!types.length) throw badRequest('Add at least one ticket type before publishing');
  if (!types.some((t) => t.sectionKeys.length)) throw badRequest('Assign venue sections to your ticket types before publishing');

  await withTransaction(async (session) => {
    const fresh = await Event.findById(event._id).session(session);
    if (!fresh.inventoryGeneratedAt) {
      const { totalSeats } = await generateInventory(fresh, { session });
      fresh.totalSeats = totalSeats;
      fresh.inventoryGeneratedAt = new Date();
    }
    fresh.status = EVENT_STATUS.PUBLISHED;
    fresh.publishedAt = fresh.publishedAt || new Date();
    await fresh.save({ session });
  });
  const published = await Event.findById(event._id);
  await refreshPriceRange(published);
  return published;
}

export async function unpublishEvent(eventId, user) {
  const event = await getOwnedEvent(eventId, user);
  if (event.status !== EVENT_STATUS.PUBLISHED) throw conflict('Only published events can be unpublished');
  event.status = EVENT_STATUS.UNPUBLISHED;
  await event.save();
  return event;
}

/** Cancels the event; refunds + notifications are processed as a background job. */
export async function cancelEvent(eventId, user, reason) {
  const event = await getOwnedEvent(eventId, user);
  if (event.status === EVENT_STATUS.CANCELLED) return event;
  if (event.endsAt < new Date()) throw conflict('This event has already ended');
  event.status = EVENT_STATUS.CANCELLED;
  event.cancelledAt = new Date();
  event.cancellationReason = reason;
  await event.save();
  domainEvents.publish(DOMAIN_EVENTS.EVENT_CANCELLED, { eventId: String(event._id), reason });
  await enqueue(JOBS.PROCESS_EVENT_CANCELLATION, { eventId: String(event._id), reason });
  return event;
}

export async function deleteEvent(eventId, user) {
  const event = await getOwnedEvent(eventId, user);
  if (event.inventoryGeneratedAt) throw conflict('Published events cannot be deleted. Cancel the event instead.');
  await TicketType.deleteMany({ event: event._id });
  await event.deleteOne();
}

export async function listOrganizerEvents(user, query) {
  const filter = user.role === ROLES.ADMIN ? {} : { organizer: user.id };
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    Event.find(filter)
      .select('title slug status moderation category city venueName startsAt endsAt totalSeats seatsSold checkedInCount minPrice maxPrice bannerUrl highDemand')
      .sort({ startsAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Event.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(query, total) };
}

export async function getOrganizerEvent(eventId, user) {
  const event = await getOwnedEvent(eventId, user);
  const [ticketTypes, venue] = await Promise.all([
    TicketType.find({ event: event._id }).sort({ sortOrder: 1 }).lean(),
    Venue.findById(event.venue).select('name city capacity layout.sections.key layout.sections.name').lean(),
  ]);
  return { ...event.toObject(), ticketTypes, venue };
}

export async function getSeatMapForOrganizer(eventId, user) {
  const event = await getOwnedEvent(eventId, user);
  return getOrganizerSeatMap(event);
}
