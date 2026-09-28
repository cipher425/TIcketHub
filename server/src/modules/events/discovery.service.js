import mongoose from 'mongoose';
import { Event } from './event.model.js';
import { TicketType } from './ticketType.model.js';
import { User } from '../users/user.model.js';
import { computeBookingStatus, publicVisibilityFilter } from './eventRules.js';
import { ticketTypeAvailability } from '../seating/inventory.service.js';
import { EVENT_STATUS, MODERATION } from '../../config/constants.js';
import { cache } from '../../infra/cache.js';
import { escapeRegex, pageMeta } from '../../utils/http.js';
import { notFound } from '../../utils/AppError.js';

const CARD_FIELDS =
  'title slug bannerUrl category venueName city startsAt endsAt salesStartAt salesEndAt minPrice maxPrice seatsSold totalSeats isFeatured highDemand status moderation';

const SORTS = {
  date: { startsAt: 1, _id: 1 },
  price_asc: { minPrice: 1, startsAt: 1 },
  price_desc: { minPrice: -1, startsAt: 1 },
  popularity: { popularityScore: -1, startsAt: 1 },
};

const toCard = (e) => ({ ...e, bookingStatus: computeBookingStatus(e) });

export async function listEvents(query) {
  const filter = publicVisibilityFilter();
  if (query.city) filter.cityKey = query.city.toLowerCase();
  if (query.category) filter.category = query.category;
  if (query.from || query.to) {
    filter.startsAt = {};
    if (query.from) filter.startsAt.$gte = query.from;
    if (query.to) filter.startsAt.$lte = query.to;
  }
  // Price range overlap: the event's cheapest ticket <= max AND its dearest ticket >= min.
  if (query.maxPrice !== undefined) filter.minPrice = { $lte: query.maxPrice };
  if (query.minPrice !== undefined) filter.maxPrice = { $gte: query.minPrice };
  if (query.q) {
    // Case-insensitive "contains" search - simple and works for search-as-you-type.
    // Known limitation (documented for Stage 2): unanchored regex cannot use an index.
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: rx }, { venueName: rx }, { tags: rx }, { city: rx }];
  }

  const { page, limit } = query;
  const [items, total] = await Promise.all([
    Event.find(filter)
      .select(CARD_FIELDS)
      .sort(SORTS[query.sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Event.countDocuments(filter),
  ]);
  return { items: items.map(toCard), meta: pageMeta(query, total) };
}

export function getHome(city) {
  const key = `home:${(city || 'all').toLowerCase()}`;
  return cache.getOrSet(key, 30, async () => {
    const base = publicVisibilityFilter();
    if (city) base.cityKey = city.toLowerCase();
    const [featured, upcoming, popular, categories] = await Promise.all([
      Event.find({ ...base, isFeatured: true }).select(CARD_FIELDS).sort({ startsAt: 1 }).limit(6).lean(),
      Event.find(base).select(CARD_FIELDS).sort({ startsAt: 1 }).limit(8).lean(),
      Event.find(base).select(CARD_FIELDS).sort({ popularityScore: -1 }).limit(8).lean(),
      Event.aggregate([{ $match: base }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);
    return {
      featured: featured.map(toCard),
      upcoming: upcoming.map(toCard),
      popular: popular.map(toCard),
      categories: categories.map((c) => ({ name: c._id, count: c.count })),
    };
  });
}

export function listCities() {
  return cache.getOrSet('cities', 60, async () => {
    const rows = await Event.aggregate([
      { $match: publicVisibilityFilter() },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);
    return rows.map((r) => ({ name: r._id, count: r.count }));
  });
}

/** Public event page. Accepts either a slug or an id. */
export async function getPublicEvent(idOrSlug) {
  const byId = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const event = await Event.findOne({
    ...byId,
    moderation: MODERATION.ACTIVE,
    status: { $in: [EVENT_STATUS.PUBLISHED, EVENT_STATUS.CANCELLED] },
  }).lean();
  if (!event) throw notFound('Event');

  const [ticketTypes, availability, organizer] = await Promise.all([
    TicketType.find({ event: event._id }).sort({ sortOrder: 1, price: -1 }).lean(),
    ticketTypeAvailability(event._id),
    User.findById(event.organizer).select('name organizerProfile.orgName').lean(),
  ]);

  // Fire-and-forget popularity signal; never slows down the page.
  Event.updateOne({ _id: event._id }, { $inc: { viewCount: 1, popularityScore: 1 } }).catch(() => {});

  const { blockedSeatLabels: _b, ...publicEvent } = event;
  return {
    ...publicEvent,
    organizer: { id: String(event.organizer), name: organizer?.organizerProfile?.orgName || organizer?.name },
    bookingStatus: computeBookingStatus(event),
    seatsAvailable: Math.max(0, event.totalSeats - event.seatsSold),
    ticketTypes: ticketTypes.map((t) => {
      const a = availability.get(String(t._id)) || { total: 0, available: 0 };
      return { id: String(t._id), name: t.name, description: t.description, price: t.price, color: t.color, currency: t.currency, ...a };
    }),
  };
}

/** Lightweight lookup used by the seat endpoints to make sure the event is visible. */
export async function getVisibleEventOrThrow(eventId) {
  const event = await Event.findOne({ _id: eventId, moderation: MODERATION.ACTIVE, status: EVENT_STATUS.PUBLISHED })
    .select('_id title startsAt endsAt policies highDemand status moderation salesStartAt salesEndAt totalSeats seatsSold')
    .lean();
  if (!event) throw notFound('Event');
  return event;
}
