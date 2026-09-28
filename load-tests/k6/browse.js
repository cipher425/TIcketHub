/**
 * Stage 2 - Scenario A: "Everyone opens the event page at once".
 * Read-heavy traffic: home -> listing -> event details -> seat layout -> availability polling.
 *
 *   k6 run -e BASE=http://localhost:5000 -e EVENT=<eventId> load-tests/k6/browse.js
 *   k6 run -e PEAK=1000 ... (default 500 virtual users)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:5000';
const API = `${BASE}/api/v1`;
const PEAK = Number(__ENV.PEAK || 500);

const layoutTime = new Trend('seat_layout_ms', true);
const availabilityTime = new Trend('seat_availability_ms', true);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: Math.round(PEAK / 5) },
        { duration: '1m', target: PEAK },
        { duration: '1m', target: PEAK },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  let eventId = __ENV.EVENT;
  if (!eventId) {
    const res = http.get(`${API}/events?limit=1&sort=popularity`);
    eventId = res.json('data.0._id');
  }
  if (!eventId) throw new Error('No event found - seed the database or pass -e EVENT=<id>');
  return { eventId };
}

export default function ({ eventId }) {
  const home = http.get(`${API}/catalog/home`, { tags: { name: 'home' } });
  check(home, { 'home 200': (r) => r.status === 200 });

  http.get(`${API}/events?page=1&limit=12&sort=date`, { tags: { name: 'list' } });
  const details = http.get(`${API}/events/${eventId}`, { tags: { name: 'details' } });
  check(details, { 'details 200': (r) => r.status === 200 });

  const layout = http.get(`${API}/events/${eventId}/seat-layout`, { tags: { name: 'seat-layout' } });
  layoutTime.add(layout.timings.duration);
  check(layout, { 'layout 200': (r) => r.status === 200 });

  // Stage 1 frontend polls availability every ~10s while the seat map is open.
  for (let i = 0; i < 3; i++) {
    const a = http.get(`${API}/events/${eventId}/seat-availability`, { tags: { name: 'seat-availability' } });
    availabilityTime.add(a.timings.duration);
    check(a, { 'availability 200': (r) => r.status === 200 });
    sleep(Number(__ENV.POLL_SECONDS || 10));
  }
}
