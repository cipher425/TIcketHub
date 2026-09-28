import mongoose from 'mongoose';
import { EventSeat } from './eventSeat.model.js';
import { getReservationStore } from './reservation/index.js';
import { TicketType } from '../events/ticketType.model.js';
import { Venue } from '../venues/venue.model.js';
import { SEAT_CODE, SEAT_STATUS, DOMAIN_EVENTS } from '../../config/constants.js';
import { cache } from '../../infra/cache.js';
import { domainEvents } from '../../infra/events/domainEvents.js';
import { notFound } from '../../utils/AppError.js';

const LAYOUT_TTL_SECONDS = 300;
export const layoutCacheKey = (eventId) => `layout:${eventId}`;

/**
 * Copies the venue layout into per-event EventSeat documents (runs once, at first publish).
 * Sections without a ticket type, and seats the organizer blocked, start as BLOCKED.
 */
export async function generateInventory(event, { session } = {}) {
  const venue = await Venue.findById(event.venue).session(session).lean();
  if (!venue) throw notFound('Venue');
  const ticketTypes = await TicketType.find({ event: event._id }).session(session).lean();

  const typeBySection = new Map();
  for (const t of ticketTypes) for (const key of t.sectionKeys) typeBySection.set(key, t._id);
  const blocked = new Set(event.blockedSeatLabels || []);

  const docs = [];
  for (const section of venue.layout.sections) {
    const ticketType = typeBySection.get(section.key);
    for (const row of section.rows) {
      for (const seat of row.seats) {
        docs.push({
          event: event._id,
          ticketType,
          sectionKey: section.key,
          sectionName: section.name,
          rowLabel: row.label,
          number: seat.number,
          label: seat.label,
          x: seat.x,
          y: seat.y,
          status: !ticketType || blocked.has(seat.label) ? SEAT_STATUS.BLOCKED : SEAT_STATUS.AVAILABLE,
        });
      }
    }
  }
  await EventSeat.insertMany(docs, { session });
  return { totalSeats: docs.filter((d) => d.status === SEAT_STATUS.AVAILABLE).length };
}

function groupIntoSections(seats) {
  const sections = new Map();
  let maxX = 0;
  let maxY = 0;
  for (const s of seats) {
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
    if (!sections.has(s.sectionKey)) {
      sections.set(s.sectionKey, {
        key: s.sectionKey,
        name: s.sectionName,
        ticketTypeId: s.ticketType ? String(s.ticketType) : null,
        minY: s.y,
        rows: new Map(),
      });
    }
    const section = sections.get(s.sectionKey);
    section.minY = Math.min(section.minY, s.y);
    if (!section.rows.has(s.rowLabel)) section.rows.set(s.rowLabel, { label: s.rowLabel, seats: [] });
    const seat = { id: String(s._id ?? s.label), label: s.label, number: s.number, x: s.x, y: s.y };
    if (s.statusCode) seat.status = s.statusCode;
    section.rows.get(s.rowLabel).seats.push(seat);
  }
  return {
    width: +(maxX + 2.5).toFixed(2),
    height: +(maxY + 1.5).toFixed(2),
    stageLabel: 'STAGE',
    sections: [...sections.values()]
      .sort((a, b) => a.minY - b.minY)
      .map(({ minY, rows, ...rest }) => ({
        ...rest,
        labelY: +(minY - 1.2).toFixed(2),
        rows: [...rows.values()].map((r) => ({ ...r, seats: r.seats.sort((a, b) => a.x - b.x) })),
      })),
  };
}

const publicTicketType = (t) => ({
  id: String(t._id),
  name: t.name,
  description: t.description,
  price: t.price,
  currency: t.currency,
  color: t.color,
});

/**
 * The static part of the seat map (positions, sections, prices). Rarely changes, so it can be
 * cached aggressively - the dynamic part (who holds what) comes from getAvailability().
 */
export function getSeatLayout(eventId) {
  return cache.getOrSet(layoutCacheKey(eventId), LAYOUT_TTL_SECONDS, async () => {
    const [seats, ticketTypes] = await Promise.all([
      EventSeat.find({ event: eventId }).select('ticketType sectionKey sectionName rowLabel number label x y').lean(),
      TicketType.find({ event: eventId }).sort({ sortOrder: 1, price: -1 }).lean(),
    ]);
    return { eventId: String(eventId), ...groupIntoSections(seats), ticketTypes: ticketTypes.map(publicTicketType) };
  });
}

export async function getAvailability(eventId) {
  return { seats: await getReservationStore().getAvailability(eventId), serverTime: new Date().toISOString() };
}

/** Organizer view: works for drafts (built from the venue template) and published events. */
export async function getOrganizerSeatMap(event) {
  const ticketTypes = await TicketType.find({ event: event._id }).sort({ sortOrder: 1, price: -1 }).lean();
  let seats;
  if (event.inventoryGeneratedAt) {
    const docs = await EventSeat.find({ event: event._id }).lean();
    const now = Date.now();
    seats = docs.map((d) => {
      let status = d.status;
      if (status === SEAT_STATUS.HELD && d.holdExpiresAt?.getTime() < now) status = SEAT_STATUS.AVAILABLE;
      return { ...d, statusCode: SEAT_CODE[status] };
    });
  } else {
    const venue = await Venue.findById(event.venue).lean();
    if (!venue) throw notFound('Venue');
    const typeBySection = new Map();
    for (const t of ticketTypes) for (const key of t.sectionKeys) typeBySection.set(key, t._id);
    const blocked = new Set(event.blockedSeatLabels || []);
    seats = [];
    for (const section of venue.layout.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          const ticketType = typeBySection.get(section.key);
          seats.push({
            sectionKey: section.key,
            sectionName: section.name,
            rowLabel: row.label,
            ticketType,
            ...seat,
            statusCode: !ticketType || blocked.has(seat.label) ? SEAT_CODE.BLOCKED : SEAT_CODE.AVAILABLE,
          });
        }
      }
    }
  }
  return {
    eventId: String(event._id),
    inventoryGenerated: Boolean(event.inventoryGeneratedAt),
    ...groupIntoSections(seats),
    ticketTypes: ticketTypes.map((t) => ({ ...publicTicketType(t), sectionKeys: t.sectionKeys })),
  };
}

/** Organizer blocks/unblocks seats (house seats, camera positions, broken seats ...). */
export async function setBlockedSeats(event, labels) {
  const set = [...new Set(labels)];
  event.blockedSeatLabels = set;
  if (event.inventoryGeneratedAt) {
    // Only AVAILABLE seats can be blocked; held/booked seats are never taken away from a buyer.
    await EventSeat.updateMany(
      { event: event._id, label: { $in: set }, status: SEAT_STATUS.AVAILABLE },
      { $set: { status: SEAT_STATUS.BLOCKED } }
    );
    await EventSeat.updateMany(
      { event: event._id, label: { $nin: set }, status: SEAT_STATUS.BLOCKED, ticketType: { $exists: true, $ne: null } },
      { $set: { status: SEAT_STATUS.AVAILABLE } }
    );
    event.totalSeats = await EventSeat.countDocuments({ event: event._id, status: { $ne: SEAT_STATUS.BLOCKED } });
    domainEvents.publish(DOMAIN_EVENTS.SEATS_CHANGED, { eventId: String(event._id), refresh: true });
  }
  await event.save();
  return event;
}

/** Seats left per ticket type, for the event details page. */
export async function ticketTypeAvailability(eventId) {
  const rows = await EventSeat.aggregate([
    { $match: { event: new mongoose.Types.ObjectId(String(eventId)), status: { $ne: SEAT_STATUS.BLOCKED } } },
    {
      $group: {
        _id: '$ticketType',
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', SEAT_STATUS.AVAILABLE] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, available: r.available }]));
}
