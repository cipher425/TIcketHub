/**
 * Stage 2 correctness test: N users try to hold THE SAME seat at the same instant.
 *
 * Expected (correct system): exactly 1 success (201) and N-1 conflicts (409 SEATS_UNAVAILABLE),
 * and the database shows exactly one active booking for that seat.
 *
 * Usage (API must be running):
 *   npm run race -- --users 100
 *   npm run race -- --users 500 --base http://localhost:5000 --event <eventId>
 *
 * It creates throwaway users directly in the DB and signs their JWTs locally, so the auth
 * rate limiter is not involved. Use RATE_LIMIT_ENABLED=false on the server so the
 * per-IP API limiter does not reject the burst.
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/infra/db/mongoose.js';
import { User } from '../src/modules/users/user.model.js';
import { Event } from '../src/modules/events/event.model.js';
import { EventSeat } from '../src/modules/seating/eventSeat.model.js';
import { Booking } from '../src/modules/bookings/booking.model.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';
import { EVENT_STATUS, SEAT_STATUS } from '../src/config/constants.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const USERS = Number(arg('users', 100));
const BASE = arg('base', 'http://localhost:5000');

async function main() {
  await connectDb();
  const event = arg('event')
    ? await Event.findById(arg('event'))
    : await Event.findOne({ status: EVENT_STATUS.PUBLISHED, startsAt: { $gt: new Date() }, highDemand: { $ne: true } }).sort({ startsAt: 1 });
  if (!event) throw new Error('No published upcoming event found. Run the seed first.');
  const seat = await EventSeat.findOne({ event: event._id, status: SEAT_STATUS.AVAILABLE });
  if (!seat) throw new Error('No available seat in this event');

  console.log(`Event: ${event.title}\nSeat:  ${seat.label} (${seat._id})\nUsers: ${USERS}\n`);

  const runId = Date.now();
  const users = await User.insertMany(
    Array.from({ length: USERS }, (_, i) => ({ name: `Race User ${i}`, email: `race-${runId}-${i}@load.test`, passwordHash: 'x' }))
  );
  const tokens = users.map((u) => signAccessToken(u));

  const fire = async (token) => {
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/v1/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId: String(event._id), seatIds: [String(seat._id)] }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, code: body?.error?.code, ms: performance.now() - t0 };
  };

  const started = performance.now();
  const results = await Promise.all(tokens.map(fire)); // all requests in flight together
  const wall = performance.now() - started;

  const byStatus = {};
  for (const r of results) {
    const key = `${r.status}${r.code ? ` ${r.code}` : ''}`;
    byStatus[key] = (byStatus[key] || 0) + 1;
  }
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))].toFixed(1);

  const holders = await Booking.countDocuments({ event: event._id, 'items.seat': seat._id, isActiveHold: true });
  const successes = results.filter((r) => r.status === 201).length;

  console.log('Responses:', byStatus);
  console.log(`Latency ms  p50=${p(0.5)}  p95=${p(0.95)}  p99=${p(0.99)}  max=${lat.at(-1).toFixed(1)}`);
  console.log(`Wall time   ${wall.toFixed(0)} ms for ${USERS} concurrent requests`);
  console.log(`DB check    active bookings holding ${seat.label}: ${holders}`);
  console.log(successes === 1 && holders === 1 ? '\nPASS: exactly one winner, no double booking' : '\nFAIL: consistency violated!');

  // Clean up the throwaway users and their holds.
  const userIds = users.map((u) => u._id);
  const held = await Booking.find({ user: { $in: userIds } }).select('_id').lean();
  await EventSeat.updateMany(
    { holdId: { $in: held.map((b) => b._id) } },
    { $set: { status: SEAT_STATUS.AVAILABLE }, $unset: { holdId: 1, heldBy: 1, holdExpiresAt: 1 } }
  );
  await Booking.deleteMany({ user: { $in: userIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  console.log('(cleaned up test users and holds - note: with RESERVATION_STORE=redis the Redis hold expires on its own)');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await disconnectDb();
  });
