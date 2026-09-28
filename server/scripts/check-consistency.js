/**
 * Verifies booking consistency for an event after a load test. Run: node scripts/check-consistency.js <eventId>
 *
 * Checks:
 *  1. No seat belongs to more than one CONFIRMED booking     (no double booking)
 *  2. Every BOOKED seat points to a CONFIRMED booking          (no orphan bookings)
 *  3. Event.seatsSold equals the number of BOOKED seats       (counters correct)
 *  4. Tickets issued == seats in confirmed bookings           (one ticket per seat)
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/infra/db/mongoose.js';
import { Booking } from '../src/modules/bookings/booking.model.js';
import { EventSeat } from '../src/modules/seating/eventSeat.model.js';
import { Event } from '../src/modules/events/event.model.js';
import { Ticket } from '../src/modules/tickets/ticket.model.js';

const eventId = process.argv[2];
if (!eventId) {
  console.error('Usage: node scripts/check-consistency.js <eventId>');
  process.exit(1);
}

await connectDb();
const id = new mongoose.Types.ObjectId(eventId);

const doubles = await Booking.aggregate([
  { $match: { event: id, status: 'CONFIRMED' } },
  { $unwind: '$items' },
  { $group: { _id: '$items.seat', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
]);
const confirmedSeats = (await Booking.aggregate([
  { $match: { event: id, status: 'CONFIRMED' } },
  { $group: { _id: null, n: { $sum: { $size: '$items' } } } },
]))[0]?.n || 0;
const bookedSeats = await EventSeat.countDocuments({ event: id, status: 'BOOKED' });
const confirmedIds = new Set((await Booking.find({ event: id, status: 'CONFIRMED' }).select('_id').lean()).map((b) => String(b._id)));
const orphanSeats = (await EventSeat.find({ event: id, status: 'BOOKED' }).select('booking').lean()).filter((s) => !confirmedIds.has(String(s.booking))).length;
const event = await Event.findById(id).lean();
const tickets = await Ticket.countDocuments({ event: id, status: { $ne: 'CANCELLED' } });
const statusCounts = await Booking.aggregate([{ $match: { event: id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);

const checks = [
  ['No seat in two confirmed bookings', doubles.length === 0, `${doubles.length} double-booked seats`],
  ['Every BOOKED seat has a confirmed booking', orphanSeats === 0, `${orphanSeats} orphan seats`],
  ['Seats in confirmed bookings == BOOKED seats', confirmedSeats === bookedSeats, `${confirmedSeats} vs ${bookedSeats}`],
  ['Event.seatsSold matches', event.seatsSold === bookedSeats, `${event.seatsSold} vs ${bookedSeats}`],
  ['One ticket per sold seat', tickets === confirmedSeats, `${tickets} vs ${confirmedSeats}`],
];

console.log(`\nConsistency report: ${event.title}`);
console.log('Booking statuses:', Object.fromEntries(statusCounts.map((s) => [s._id, s.n])));
for (const [name, pass, detail] of checks) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
process.exitCode = checks.every(([, pass]) => pass) ? 0 : 1;
await disconnectDb();
