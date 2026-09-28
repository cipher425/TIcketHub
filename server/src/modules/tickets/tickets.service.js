import { Ticket } from './ticket.model.js';
import { ROLES, TICKET_STATUS } from '../../config/constants.js';
import { ticketCode } from '../../utils/codes.js';
import { forbidden, notFound } from '../../utils/AppError.js';
import { pageMeta } from '../../utils/http.js';

/** Called inside the booking-confirmation transaction: one ticket per seat. */
export async function issueTickets({ booking, event, holderName, session }) {
  const docs = booking.items.map((item) => ({
    ticketCode: ticketCode(),
    booking: booking._id,
    bookingRef: booking.bookingRef,
    event: booking.event,
    user: booking.user,
    seat: item.seat,
    holderName,
    eventTitle: event.title,
    venueName: event.venueName,
    venueAddress: event.address,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    sectionName: item.sectionName,
    rowLabel: item.rowLabel,
    seatLabel: item.label,
    ticketTypeName: item.ticketTypeName,
    price: item.price,
  }));
  return Ticket.insertMany(docs, { session });
}

function assertCanView(ticket, user) {
  if (user.role === ROLES.ADMIN) return;
  if (String(ticket.user) !== user.id) throw forbidden('This ticket belongs to someone else');
}

export async function getTicket(ticketId, user) {
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw notFound('Ticket');
  assertCanView(ticket, user);
  return ticket;
}

export async function listMyTickets(user, { scope = 'upcoming', page = 1, limit = 20 }) {
  const now = new Date();
  const filter = { user: user.id };
  if (scope === 'upcoming') Object.assign(filter, { status: TICKET_STATUS.ACTIVE, endsAt: { $gte: now } });
  else Object.assign(filter, { $or: [{ endsAt: { $lt: now } }, { status: { $ne: TICKET_STATUS.ACTIVE } }] });
  const [items, total] = await Promise.all([
    Ticket.find(filter)
      .sort({ startsAt: scope === 'upcoming' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Ticket.countDocuments(filter),
  ]);
  return { items, meta: pageMeta({ page, limit }, total) };
}

export function listBookingTickets(bookingId) {
  return Ticket.find({ booking: bookingId }).sort({ seatLabel: 1 }).lean();
}
