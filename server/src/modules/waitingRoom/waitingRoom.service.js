import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { Event } from '../events/event.model.js';
import { getRedis } from '../../infra/redis.js';
import { badRequest, notFound } from '../../utils/AppError.js';

/**
 * Stage 3: Virtual waiting room for high-demand drops.
 *
 *   Users --> queue (FIFO, Redis sorted set) --> admitted set (max N at a time) --> booking API
 *
 * Instead of 10,000 people hammering the seat-hold endpoint at once, only
 * WAITING_ROOM_MAX_ACTIVE shoppers are "inside" at any moment. Everyone else sees their
 * queue position. An admitted user gets a short-lived signed admission token that the
 * booking endpoint checks (see waitingRoom.middleware.js).
 *
 * Keys:  wr:{eventId}:seq       counter giving FIFO order
 *        wr:{eventId}:queue     ZSET userId -> seq
 *        wr:{eventId}:admitted  ZSET userId -> admittedUntil (ms)
 *        wr:active              SET of eventIds with a live queue
 */
const k = (eventId, name) => `wr:{${eventId}}:${name}`;
const ACTIVE_SET = 'wr:active';
export const ADMIT_INTERVAL_MS = 5000;

function signAdmission(userId, eventId, untilMs) {
  return jwt.sign({ sub: userId, eventId, typ: 'admission' }, env.ADMISSION_TOKEN_SECRET, {
    expiresIn: Math.max(1, Math.floor((untilMs - Date.now()) / 1000)),
  });
}

export function verifyAdmission(token, userId, eventId) {
  try {
    const p = jwt.verify(token, env.ADMISSION_TOKEN_SECRET);
    return p.typ === 'admission' && p.sub === userId && p.eventId === String(eventId);
  } catch {
    return false;
  }
}

async function loadHighDemandEvent(eventId) {
  const event = await Event.findById(eventId).select('highDemand status title').lean();
  if (!event) throw notFound('Event');
  if (!event.highDemand) throw badRequest('This event does not use a waiting room', undefined, 'NO_WAITING_ROOM');
  return event;
}

export async function getStatus(userId, eventId) {
  const redis = getRedis();
  const now = Date.now();
  const until = await redis.zscore(k(eventId, 'admitted'), userId);
  if (until && Number(until) > now) {
    return {
      status: 'ADMITTED',
      admissionToken: signAdmission(userId, String(eventId), Number(until)),
      admittedUntil: new Date(Number(until)).toISOString(),
    };
  }
  const rank = await redis.zrank(k(eventId, 'queue'), userId);
  if (rank === null) return { status: 'NOT_IN_QUEUE' };
  const position = rank + 1;
  const perTick = Math.max(1, Math.ceil(env.WAITING_ROOM_MAX_ACTIVE / 10));
  return {
    status: 'WAITING',
    position,
    queueLength: await redis.zcard(k(eventId, 'queue')),
    estimatedWaitSeconds: Math.ceil(position / perTick) * (ADMIT_INTERVAL_MS / 1000),
  };
}

export async function join(userId, eventId) {
  await loadHighDemandEvent(eventId);
  const current = await getStatus(userId, eventId);
  if (current.status !== 'NOT_IN_QUEUE') return current;
  const redis = getRedis();
  const seq = await redis.incr(k(eventId, 'seq'));
  await redis.zadd(k(eventId, 'queue'), 'NX', seq, userId); // NX: re-joining never moves you back
  await redis.sadd(ACTIVE_SET, String(eventId));
  return getStatus(userId, eventId);
}

export async function leave(userId, eventId) {
  const redis = getRedis();
  await redis.zrem(k(eventId, 'queue'), userId);
  await redis.zrem(k(eventId, 'admitted'), userId);
}

/** Scheduled job: moves people from the queue into the store as slots free up. */
export async function admitTick() {
  const redis = getRedis();
  if (!redis) return 0;
  const now = Date.now();
  const events = await redis.smembers(ACTIVE_SET);
  let admittedTotal = 0;
  for (const eventId of events) {
    await redis.zremrangebyscore(k(eventId, 'admitted'), '-inf', now);
    const inside = await redis.zcard(k(eventId, 'admitted'));
    const slots = env.WAITING_ROOM_MAX_ACTIVE - inside;
    if (slots > 0) {
      const popped = await redis.zpopmin(k(eventId, 'queue'), slots); // [member, score, member, score ...]
      const until = now + env.WAITING_ROOM_ADMISSION_SECONDS * 1000;
      const args = [];
      for (let i = 0; i < popped.length; i += 2) args.push(until, popped[i]);
      if (args.length) await redis.zadd(k(eventId, 'admitted'), ...args);
      admittedTotal += args.length / 2;
    }
    const [queued, admitted] = await Promise.all([redis.zcard(k(eventId, 'queue')), redis.zcard(k(eventId, 'admitted'))]);
    if (!queued && !admitted) await redis.srem(ACTIVE_SET, eventId);
  }
  return admittedTotal;
}
