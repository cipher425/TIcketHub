/**
 * Stage 3 worker process (QUEUE_DRIVER=bullmq).
 * Runs background jobs - notifications, hold sweeping, refunds, reminders, waiting-room
 * admission - separately from the API, so slow jobs never steal CPU from HTTP requests.
 *
 *   npm run worker
 */
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import { connectDb } from './infra/db/mongoose.js';
import { startWorker, stopJobs } from './infra/jobs/index.js';
import { registerJobs } from './jobs/registry.js';
import { registerListeners } from './modules/notifications/listeners.js';

if (env.QUEUE_DRIVER !== 'bullmq') {
  logger.error('The worker is only needed with QUEUE_DRIVER=bullmq');
  process.exit(1);
}

await connectDb();
registerListeners(); // jobs (e.g. hold expiry) publish domain events too
registerJobs();
await startWorker({ concurrency: 10 });

process.on('SIGTERM', async () => {
  await stopJobs();
  process.exit(0);
});
