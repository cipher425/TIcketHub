import { EventEmitter } from 'node:events';
import { logger } from '../logger.js';

/**
 * In-process domain event bus.
 *
 * Modules publish facts ("booking.confirmed") instead of calling each other's side effects.
 * Stage 1: Node EventEmitter (same process, fire-and-forget).
 * Stage 3: listeners can enqueue BullMQ jobs instead of doing the work inline,
 * without the publishers changing at all.
 */
const bus = new EventEmitter();
bus.setMaxListeners(50);

export const domainEvents = {
  publish(name, payload) {
    bus.emit(name, payload);
  },
  subscribe(name, handler) {
    bus.on(name, (payload) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => logger.error({ err, event: name }, 'Domain event handler failed'));
    });
  },
};
