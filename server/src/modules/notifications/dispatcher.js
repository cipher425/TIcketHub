import { JOBS } from '../../config/constants.js';
import { enqueue } from '../../infra/jobs/index.js';

/**
 * The NotificationDispatcher seam. Callers say WHAT to notify; HOW it is delivered is hidden.
 * Stage 1: enqueue() with the inline driver = runs right after the request, same process.
 * Stage 3: QUEUE_DRIVER=bullmq = Redis queue + worker process with retries.
 */
export function notify(userId, { type, title, body, link, dedupeKey }) {
  return enqueue(JOBS.SEND_NOTIFICATION, { userId: String(userId), type, title, body, link, dedupeKey });
}
