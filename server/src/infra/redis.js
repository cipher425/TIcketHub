import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let client = null;

/** Shared Redis connection (Stage 3). Returns null when REDIS_URL is not configured. */
export function getRedis() {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = createRedisConnection();
    client.on('error', (err) => logger.error({ err }, 'Redis error'));
  }
  return client;
}

/** A dedicated connection (BullMQ workers and pub/sub subscribers need their own). */
export function createRedisConnection() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function closeRedis() {
  if (client) await client.quit();
  client = null;
}
