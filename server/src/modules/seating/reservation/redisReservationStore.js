import { EventSeat } from '../eventSeat.model.js';
import { SEAT_CODE, SEAT_STATUS } from '../../../config/constants.js';
import { getRedis } from '../../../infra/redis.js';

const { AVAILABLE, BOOKED, BLOCKED } = SEAT_STATUS;

/**
 * Stage 3 reservation store: holds live in Redis, MongoDB only stores the final BOOKED state.
 *
 *   seat:{eventId}:<seatId>  -> holdId   (string with TTL = hold duration; the lock itself)
 *   held:{eventId}           -> sorted set seatId -> expiresAtMs (index for fast availability reads)
 *
 * The `{eventId}` hash tag keeps all keys of one event in the same Redis Cluster slot,
 * which Lua scripts require.
 *
 * Why this is faster: a hold is one in-memory Lua script instead of MongoDB writes,
 * expiry is automatic (TTL), and hold churn no longer touches the database at all.
 */
const seatKey = (eventId, seatId) => `seat:{${eventId}}:${seatId}`;
const heldKey = (eventId) => `held:{${eventId}}`;

// All-or-nothing multi-seat acquire. Runs atomically inside Redis.
// KEYS = seat keys..., heldKey ; ARGV = holdId, ttlMs, expiresAtMs, seatIds...
const ACQUIRE = `
local n = #KEYS - 1
local taken = {}
for i = 1, n do
  local owner = redis.call('GET', KEYS[i])
  if owner and owner ~= ARGV[1] then table.insert(taken, ARGV[3 + i]) end
end
if #taken > 0 then return taken end
for i = 1, n do
  redis.call('SET', KEYS[i], ARGV[1], 'PX', ARGV[2])
  redis.call('ZADD', KEYS[n + 1], ARGV[3], ARGV[3 + i])
end
return {}
`;

// Delete only the keys this hold owns.  ARGV = holdId, seatIds...
const RELEASE = `
local n = #KEYS - 1
for i = 1, n do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    redis.call('DEL', KEYS[i])
    redis.call('ZREM', KEYS[n + 1], ARGV[1 + i])
  end
end
return 1
`;

// ARGV = holdId, ttlMs, expiresAtMs, seatIds...
const EXTEND = `
local n = #KEYS - 1
for i = 1, n do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    redis.call('PEXPIRE', KEYS[i], ARGV[2])
    redis.call('ZADD', KEYS[n + 1], ARGV[3], ARGV[3 + i])
  end
end
return 1
`;

// Seats currently locked by a DIFFERENT hold. ARGV = holdId, seatIds...
const FOREIGN_OWNERS = `
local taken = {}
for i = 1, #KEYS do
  local owner = redis.call('GET', KEYS[i])
  if owner and owner ~= ARGV[1] then table.insert(taken, ARGV[1 + i]) end
end
return taken
`;

const keysFor = (eventId, seatIds) => [...seatIds.map((id) => seatKey(eventId, id)), heldKey(eventId)];

export const redisReservationStore = {
  name: 'redis',

  async hold({ eventId, seatIds, holdId, expiresAt }) {
    const redis = getRedis();
    const ids = seatIds.map(String);

    // Seats that are BOOKED/BLOCKED in MongoDB can never be held.
    const notFree = await EventSeat.find({ _id: { $in: ids }, event: eventId, status: { $ne: AVAILABLE } }).select('_id').lean();
    if (notFree.length) return { ok: false, unavailable: notFree.map((s) => String(s._id)) };

    const ttlMs = Math.max(1000, expiresAt.getTime() - Date.now());
    const taken = await redis.eval(ACQUIRE, ids.length + 1, ...keysFor(eventId, ids), String(holdId), ttlMs, expiresAt.getTime(), ...ids);
    if (taken.length) return { ok: false, unavailable: taken };

    // Re-check: a seat could have been BOOKED between our first read and the lock.
    const bookedMeanwhile = await EventSeat.find({ _id: { $in: ids }, status: { $ne: AVAILABLE } }).select('_id').lean();
    if (bookedMeanwhile.length) {
      await this.release({ eventId, holdId, seatIds: ids });
      return { ok: false, unavailable: bookedMeanwhile.map((s) => String(s._id)) };
    }
    return { ok: true, unavailable: [] };
  },

  async release({ eventId, holdId, seatIds }) {
    if (!seatIds?.length) return;
    const ids = seatIds.map(String);
    await getRedis().eval(RELEASE, ids.length + 1, ...keysFor(eventId, ids), String(holdId), ...ids);
  },

  async extend({ eventId, holdId, seatIds, expiresAt }) {
    const ids = seatIds.map(String);
    const ttlMs = Math.max(1000, expiresAt.getTime() - Date.now());
    await getRedis().eval(EXTEND, ids.length + 1, ...keysFor(eventId, ids), String(holdId), ttlMs, expiresAt.getTime(), ...ids);
  },

  /** MongoDB stays the final arbiter: the conditional AVAILABLE -> BOOKED update decides. */
  async commit({ eventId, holdId, seatIds, bookingId, session }) {
    const ids = seatIds.map(String);
    const foreign = await getRedis().eval(FOREIGN_OWNERS, ids.length, ...ids.map((id) => seatKey(eventId, id)), String(holdId), ...ids);
    if (foreign.length) return false;
    const res = await EventSeat.updateMany(
      { _id: { $in: ids }, event: eventId, status: AVAILABLE },
      { $set: { status: BOOKED, booking: bookingId } },
      { session }
    );
    return res.modifiedCount === ids.length;
  },

  async afterCommit({ eventId, holdId, seatIds }) {
    await this.release({ eventId, holdId, seatIds });
  },

  async reopen({ eventId, seatIds, session }) {
    await EventSeat.updateMany(
      { _id: { $in: seatIds }, event: eventId, status: BOOKED },
      { $set: { status: AVAILABLE }, $unset: { booking: 1 } },
      { session }
    );
  },

  async getAvailability(eventId) {
    const redis = getRedis();
    const now = Date.now();
    const [dbSeats, held] = await Promise.all([
      EventSeat.find({ event: eventId, status: { $in: [BOOKED, BLOCKED] } }).select('status').lean(),
      redis.zrangebyscore(heldKey(eventId), now, '+inf'),
    ]);
    redis.zremrangebyscore(heldKey(eventId), '-inf', now).catch(() => {});
    const out = dbSeats.map((s) => ({ id: String(s._id), s: SEAT_CODE[s.status] }));
    const taken = new Set(out.map((s) => s.id));
    for (const id of held) if (!taken.has(id)) out.push({ id, s: SEAT_CODE.HELD });
    return out;
  },

  async sweepExpired() {
    return 0; // Redis TTL expires holds by itself
  },
};
