import { env } from '../config/env.js';
import { getRedis } from './redis.js';
import { logger } from './logger.js';

/**
 * Tiny read-through cache.
 * CACHE_DRIVER=none   -> always calls the loader (Stage 1 baseline, so Stage 2 measures the raw DB)
 * CACHE_DRIVER=memory -> per-process Map with TTL (fine for one instance)
 * CACHE_DRIVER=redis  -> shared across instances (Stage 3)
 */
const memory = new Map();

async function getRaw(key) {
  if (env.CACHE_DRIVER === 'memory') {
    const hit = memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      memory.delete(key);
      return null;
    }
    return hit.value;
  }
  if (env.CACHE_DRIVER === 'redis') {
    const raw = await getRedis().get(`cache:${key}`);
    return raw ? JSON.parse(raw) : null;
  }
  return null;
}

async function setRaw(key, value, ttlSeconds) {
  if (env.CACHE_DRIVER === 'memory') {
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  } else if (env.CACHE_DRIVER === 'redis') {
    await getRedis().set(`cache:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  }
}

export const cache = {
  async getOrSet(key, ttlSeconds, loader) {
    if (env.CACHE_DRIVER === 'none') return loader();
    try {
      const hit = await getRaw(key);
      if (hit !== null) return hit;
    } catch (err) {
      logger.warn({ err, key }, 'Cache read failed, falling back to loader');
    }
    const value = await loader();
    setRaw(key, value, ttlSeconds).catch((err) => logger.warn({ err, key }, 'Cache write failed'));
    return value;
  },

  async invalidate(...keys) {
    if (env.CACHE_DRIVER === 'memory') keys.forEach((k) => memory.delete(k));
    if (env.CACHE_DRIVER === 'redis') await getRedis().del(...keys.map((k) => `cache:${k}`));
  },
};
