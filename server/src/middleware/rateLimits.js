import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { getRedis } from '../infra/redis.js';

/**
 * Stage 1: counters live in process memory (reset on restart, per instance).
 * Stage 3: RATE_LIMIT_STORE=redis shares counters across all API instances.
 */
function makeStore(prefix) {
  if (env.RATE_LIMIT_STORE !== 'redis') return undefined;
  const redis = getRedis();
  return new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (command, ...args) => redis.call(command, ...args) });
}

function limiter({ name, windowMs, limit, byUser = false, message }) {
  if (!env.RATE_LIMIT_ENABLED) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: makeStore(name),
    keyGenerator: (req) => (byUser && req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: message || 'Too many requests, slow down' } }),
  });
}

export const apiLimiter = limiter({ name: 'api', windowMs: 60_000, limit: 600 });
export const authLimiter = limiter({
  name: 'auth',
  windowMs: 15 * 60_000,
  limit: 30,
  message: 'Too many login attempts. Try again in a few minutes.',
});
export const holdLimiter = limiter({
  name: 'hold',
  windowMs: 60_000,
  limit: 20,
  byUser: true,
  message: 'Too many seat hold attempts. Please wait a moment.',
});
