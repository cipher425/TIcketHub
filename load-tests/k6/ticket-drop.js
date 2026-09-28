/**
 * Stage 2 - Scenario B: "Ticket drop" - many buyers try to book the same event at once.
 * Each virtual user: (waiting room) -> read availability -> hold random free seats -> create
 * order -> mock payment -> verify. Measures holds, conflicts and completed bookings.
 *
 * Server must run with:  PAYMENT_PROVIDER=mock  RATE_LIMIT_ENABLED=false
 *
 *   k6 run -e BASE=http://localhost:5000 -e EVENT=<eventId> -e USERS=200 load-tests/k6/ticket-drop.js
 *   Add -e WAITING_ROOM=1 when WAITING_ROOM_ENABLED=true and the event is highDemand.
 *
 * Afterwards verify consistency:  cd server && node scripts/check-consistency.js <eventId>
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const BASE = __ENV.BASE || 'http://localhost:5000';
const API = `${BASE}/api/v1`;
const USERS = Number(__ENV.USERS || 200);
const SEATS = Number(__ENV.SEATS_PER_ORDER || 2);
const USE_WR = __ENV.WAITING_ROOM === '1';

const holdOk = new Counter('holds_succeeded');
const holdConflict = new Counter('holds_conflicted');
const bookingsConfirmed = new Counter('bookings_confirmed');
const holdTime = new Trend('hold_ms', true);
const e2eTime = new Trend('checkout_end_to_end_ms', true);
const queueWait = new Trend('waiting_room_wait_ms', true);

export const options = {
  setupTimeout: '10m',
  scenarios: {
    drop: {
      executor: 'per-vu-iterations',
      vus: USERS,
      iterations: 1,
      maxDuration: '10m',
    },
  },
};

const json = (token, extra = {}) => ({
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra },
});

export function setup() {
  const eventId = __ENV.EVENT;
  if (!eventId) throw new Error('Pass -e EVENT=<eventId>');
  const runId = Date.now();
  const tokens = [];
  // Register buyers in batches (bcrypt makes this slow on purpose - that is a finding too).
  for (let i = 0; i < USERS; i += 50) {
    const reqs = [];
    for (let j = i; j < Math.min(i + 50, USERS); j++) {
      reqs.push([
        'POST',
        `${API}/auth/register`,
        JSON.stringify({ name: `Load User ${j}`, email: `load-${runId}-${j}@load.test`, password: 'Password123' }),
        { headers: { 'Content-Type': 'application/json' } },
      ]);
    }
    for (const r of http.batch(reqs)) {
      if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.body}`);
      tokens.push(r.json('data.accessToken'));
    }
  }
  return { eventId, tokens };
}

function waitForAdmission(token, eventId) {
  const t0 = Date.now();
  let status = http.post(`${API}/waiting-room/${eventId}/join`, null, json(token)).json('data');
  while (status && status.status === 'WAITING') {
    sleep(3);
    status = http.get(`${API}/waiting-room/${eventId}/status`, json(token)).json('data');
  }
  queueWait.add(Date.now() - t0);
  return status && status.admissionToken;
}

export default function ({ eventId, tokens }) {
  const token = tokens[exec.vu.idInTest - 1];
  const t0 = Date.now();
  const extra = {};
  if (USE_WR) {
    const admission = waitForAdmission(token, eventId);
    if (!admission) return;
    extra['X-Admission-Token'] = admission;
  }

  // Try up to 3 times, like a real user picking other seats after "seat just taken".
  for (let attempt = 0; attempt < 3; attempt++) {
    const layout = http.get(`${API}/events/${eventId}/seat-layout`, { tags: { name: 'seat-layout' } }).json('data');
    const taken = new Set((http.get(`${API}/events/${eventId}/seat-availability`, { tags: { name: 'seat-availability' } }).json('data.seats') || []).map((s) => s.id));
    const free = [];
    for (const sec of layout.sections) for (const row of sec.rows) for (const seat of row.seats) if (!taken.has(seat.id) && sec.ticketTypeId) free.push(seat.id);
    if (!free.length) return; // sold out

    // Everyone gravitates to the same "best" seats: pick from the first 50 free seats.
    const start = Math.floor(Math.random() * Math.min(50, free.length));
    const seatIds = free.slice(start, start + SEATS);

    const hold = http.post(`${API}/bookings`, JSON.stringify({ eventId, seatIds }), { ...json(token, extra), tags: { name: 'hold' } });
    holdTime.add(hold.timings.duration);
    if (hold.status === 409) {
      holdConflict.add(1);
      continue;
    }
    if (!check(hold, { 'hold 201': (r) => r.status === 201 })) return;
    holdOk.add(1);
    const bookingId = hold.json('data._id');

    const order = http.post(`${API}/bookings/${bookingId}/payment-order`, null, { ...json(token), tags: { name: 'payment-order' } });
    if (!check(order, { 'order 201': (r) => r.status === 201 })) return;

    const paid = http
      .post(`${API}/payments/mock/checkout`, JSON.stringify({ orderId: order.json('data.orderId'), outcome: 'success' }), json(token))
      .json('data');
    const verify = http.post(`${API}/payments/verify`, JSON.stringify(paid), { ...json(token), tags: { name: 'verify' } });
    if (check(verify, { 'confirmed': (r) => r.status === 200 && r.json('data.outcome') === 'CONFIRMED' })) {
      bookingsConfirmed.add(1);
      e2eTime.add(Date.now() - t0);
    }
    return;
  }
}
