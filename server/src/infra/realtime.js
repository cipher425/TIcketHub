import { env } from '../config/env.js';
import { logger } from './logger.js';
import { getRedis, createRedisConnection } from './redis.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

/**
 * Stage 3: real-time push with Socket.IO.
 *
 * Rooms:
 *   event:<eventId>  - everyone looking at a seat map
 *   user:<userId>    - a signed-in user's own booking updates
 *
 * Multi-instance: any process (API or worker) publishes to a Redis channel; every API
 * instance subscribes and emits to ITS OWN sockets (io.local). That is enough for fan-out
 * without the Socket.IO Redis adapter.
 */
const CHANNEL = 'rt:broadcast';
let io = null;
let subscriber = null;

export async function initRealtime(httpServer) {
  if (!env.REALTIME_ENABLED) return;
  const { Server } = await import('socket.io');
  io = new Server(httpServer, { cors: { origin: env.clientOrigins, credentials: true } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.data.userId = verifyAccessToken(token).sub;
      } catch {
        /* anonymous viewers may still watch seat maps */
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`);
    socket.on('event:join', (eventId) => {
      if (typeof eventId === 'string' && /^[a-f0-9]{24}$/i.test(eventId)) socket.join(`event:${eventId}`);
    });
    socket.on('event:leave', (eventId) => socket.leave(`event:${eventId}`));
  });

  if (getRedis()) {
    subscriber = createRedisConnection();
    await subscriber.subscribe(CHANNEL);
    subscriber.on('message', (_channel, raw) => {
      try {
        const { room, event, data } = JSON.parse(raw);
        io.local.to(room).emit(event, data);
      } catch (err) {
        logger.warn({ err }, 'Bad realtime message');
      }
    });
  }
  logger.info('Socket.IO real-time enabled');
}

export function broadcast(room, event, data) {
  if (!env.REALTIME_ENABLED) return;
  const redis = getRedis();
  if (redis) {
    redis.publish(CHANNEL, JSON.stringify({ room, event, data })).catch((err) => logger.warn({ err }, 'Realtime publish failed'));
  } else if (io) {
    io.to(room).emit(event, data);
  }
}

export async function closeRealtime() {
  if (subscriber) await subscriber.quit();
  if (io) await new Promise((resolve) => io.close(() => resolve()));
}
