import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import { connectDb, disconnectDb } from './infra/db/mongoose.js';
import { closeRedis } from './infra/redis.js';
import { initRealtime, closeRealtime } from './infra/realtime.js';
import { stopJobs } from './infra/jobs/index.js';
import { createApp } from './app.js';
import { registerJobs, scheduleJobs } from './jobs/registry.js';
import { registerListeners } from './modules/notifications/listeners.js';

async function main() {
  await connectDb();
  registerListeners();
  registerJobs();

  const app = createApp();
  const server = http.createServer(app);
  await initRealtime(server);

  // Only one process should own scheduled jobs (set RUN_JOBS=false on extra API instances).
  if (env.RUN_JOBS) await scheduleJobs();

  server.listen(env.PORT, () =>
    logger.info(
      {
        port: env.PORT,
        reservationStore: env.RESERVATION_STORE,
        queue: env.QUEUE_DRIVER,
        cache: env.CACHE_DRIVER,
        realtime: env.REALTIME_ENABLED,
        waitingRoom: env.WAITING_ROOM_ENABLED,
        payments: env.PAYMENT_PROVIDER,
      },
      'TicketHub API listening'
    )
  );

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close();
    await Promise.allSettled([stopJobs(), closeRealtime()]);
    await Promise.allSettled([disconnectDb(), closeRedis()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
