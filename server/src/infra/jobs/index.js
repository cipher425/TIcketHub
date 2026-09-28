import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { createRedisConnection } from '../redis.js';

/**
 * Job runner abstraction.
 *
 *  - registerJob(name, handler)   : declare what a job does (done once in jobs/registry.js)
 *  - enqueue(name, data)           : run it "in the background"
 *  - schedule(name, everyMs)       : run it periodically
 *
 * QUEUE_DRIVER=inline (Stage 1): setImmediate / setInterval in the API process.
 * QUEUE_DRIVER=bullmq (Stage 3): Redis-backed queue with retries; `npm run worker` processes jobs.
 * Callers never know which driver is active.
 */

const QUEUE_NAME = 'tickethub';
const handlers = new Map();
const intervals = [];
let queue = null;
let worker = null;

export function registerJob(name, handler) {
  handlers.set(name, handler);
}

async function run(name, data) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for job "${name}"`);
  return handler(data ?? {});
}

async function getQueue() {
  if (!queue) {
    const { Queue } = await import('bullmq');
    queue = new Queue(QUEUE_NAME, { connection: createRedisConnection() });
  }
  return queue;
}

export async function enqueue(name, data = {}, { delayMs = 0 } = {}) {
  if (env.QUEUE_DRIVER === 'bullmq') {
    const q = await getQueue();
    await q.add(name, data, {
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return;
  }
  const fire = () =>
    run(name, data).catch((err) => logger.error({ err, job: name }, 'Inline job failed'));
  if (delayMs > 0) setTimeout(fire, delayMs).unref?.();
  else setImmediate(fire);
}

/** Periodic job. With the inline driver, overlapping runs are skipped. */
export async function schedule(name, everyMs) {
  if (env.QUEUE_DRIVER === 'bullmq') {
    const q = await getQueue();
    await q.upsertJobScheduler(`every:${name}`, { every: everyMs }, { name, data: {} });
    logger.info({ job: name, everyMs }, 'Scheduled repeatable BullMQ job');
    return;
  }
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await run(name, {});
    } catch (err) {
      logger.error({ err, job: name }, 'Scheduled job failed');
    } finally {
      running = false;
    }
  }, everyMs);
  timer.unref?.();
  intervals.push(timer);
  logger.info({ job: name, everyMs }, 'Scheduled inline interval job');
}

/** Only used by src/worker.js in BullMQ mode. */
export async function startWorker({ concurrency = 10 } = {}) {
  const { Worker } = await import('bullmq');
  worker = new Worker(QUEUE_NAME, (job) => run(job.name, job.data), {
    connection: createRedisConnection(),
    concurrency,
  });
  worker.on('failed', (job, err) => logger.error({ err, job: job?.name }, 'BullMQ job failed'));
  logger.info({ concurrency }, 'BullMQ worker started');
  return worker;
}

export async function stopJobs() {
  intervals.splice(0).forEach(clearInterval);
  if (worker) await worker.close();
  if (queue) await queue.close();
}

/** Test helper: run a job synchronously. */
export const runJobNow = run;
