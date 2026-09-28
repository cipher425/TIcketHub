import { Ticket } from './ticket.model.js';
import { Event } from '../events/event.model.js';
import { CHECKIN_RESULT, TICKET_STATUS } from '../../config/constants.js';

/** Accepts the raw QR text. Our QR format is "TH1.<ticketCode>"; a bare code also works (manual entry). */
export function parseQr(raw) {
  const text = String(raw || '').trim();
  const code = text.startsWith('TH1.') ? text.slice(4) : text;
  return /^[A-Za-z0-9_-]{16,64}$/.test(code) ? code : null;
}

const view = (t) => ({
  ticketId: String(t._id),
  bookingRef: t.bookingRef,
  holderName: t.holderName?.split(' ')[0], // first name only: enough for the gate, minimal PII
  seatLabel: t.seatLabel,
  sectionName: t.sectionName,
  rowLabel: t.rowLabel,
  ticketTypeName: t.ticketTypeName,
  usedAt: t.usedAt,
});

/** Read-only check (scan preview). */
export async function verifyTicket(eventId, rawCode) {
  const code = parseQr(rawCode);
  if (!code) return { result: CHECKIN_RESULT.INVALID, message: 'This is not a valid ticket code' };
  const ticket = await Ticket.findOne({ ticketCode: code }).lean();
  if (!ticket) return { result: CHECKIN_RESULT.INVALID, message: 'Ticket not found' };
  if (String(ticket.event) !== String(eventId)) {
    return { result: CHECKIN_RESULT.WRONG_EVENT, message: `This ticket is for "${ticket.eventTitle}"` };
  }
  if (ticket.status === TICKET_STATUS.CANCELLED) {
    return { result: CHECKIN_RESULT.CANCELLED, message: 'This ticket was cancelled', ticket: view(ticket) };
  }
  if (ticket.status === TICKET_STATUS.USED) {
    return { result: CHECKIN_RESULT.ALREADY_USED, message: 'This ticket has already been used', ticket: view(ticket) };
  }
  return { result: CHECKIN_RESULT.VALID, message: 'Valid ticket', ticket: view(ticket) };
}

/**
 * Admit the holder. The conditional update (status must still be ACTIVE) makes this atomic:
 * if two gates scan the same ticket at the same instant, exactly one succeeds.
 */
export async function checkInTicket(eventId, rawCode, staffUserId) {
  const code = parseQr(rawCode);
  if (!code) return { result: CHECKIN_RESULT.INVALID, message: 'This is not a valid ticket code' };
  const ticket = await Ticket.findOneAndUpdate(
    { ticketCode: code, event: eventId, status: TICKET_STATUS.ACTIVE },
    { $set: { status: TICKET_STATUS.USED, usedAt: new Date(), checkedInBy: staffUserId } },
    { new: true }
  ).lean();
  if (!ticket) return verifyTicket(eventId, rawCode); // explains why (used / wrong event / invalid)
  await Event.updateOne({ _id: eventId }, { $inc: { checkedInCount: 1 } });
  return { result: CHECKIN_RESULT.VALID, admitted: true, message: 'Checked in - admit holder', ticket: view(ticket) };
}
