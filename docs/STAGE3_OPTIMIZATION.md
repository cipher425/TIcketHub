# Stage 3 - Optimizing for high-demand drops

Every optimization is **behind an environment flag**, so the Stage 1 behaviour is always one config change away and you can benchmark before/after with the exact same tests.

Start Redis: `docker compose up -d redis` (or Upstash: `REDIS_URL=rediss://...`).

| # | Problem (from Stage 2) | Change | Flag | Code |
|---|---|---|---|---|
| 1 | Hold churn writes to MongoDB; holds are short-lived hot data | Seat locks in Redis: one atomic Lua script per hold, automatic TTL expiry; MongoDB only stores BOOKED | `RESERVATION_STORE=redis` | `modules/seating/reservation/redisReservationStore.js` |
| 2 | Seat layout re-queried on every page view | Read-through cache (layout 5 min, home 30 s) | `CACHE_DRIVER=redis` | `infra/cache.js`, `inventory.service.js` |
| 3 | Availability polling every 10 s per viewer | Socket.IO pushes seat deltas to `event:<id>` rooms; polling slows to 30 s as a fallback | `REALTIME_ENABLED=true` | `infra/realtime.js`, `client/src/features/seating/useSeatData.js` |
| 4 | Jobs & notifications run inside the API process | BullMQ queue + separate worker with retries/backoff | `QUEUE_DRIVER=bullmq` + `npm run worker` | `infra/jobs/index.js`, `src/worker.js` |
| 5 | Rate limits are per process | Shared counters in Redis | `RATE_LIMIT_STORE=redis` | `middleware/rateLimits.js` |
| 6 | Thousands of buyers hit the hold endpoint at once | Virtual waiting room: FIFO queue, N admitted at a time, signed admission token required to hold seats | `WAITING_ROOM_ENABLED=true` + event `highDemand` (admin console) | `modules/waitingRoom/` |
| 7 | One Node process = one CPU core | PM2 cluster (all state above now lives in Redis) | `ecosystem.config.cjs` | |
| 8 | Duplicate payment processing | Already idempotent since Stage 1 (unique IDs, conditional transitions, webhook dedupe) + reconciliation job | - | `payments.service.js` |

## Full Stage 3 `.env`

```
REDIS_URL=redis://localhost:6379
RESERVATION_STORE=redis
CACHE_DRIVER=redis
RATE_LIMIT_STORE=redis
QUEUE_DRIVER=bullmq
REALTIME_ENABLED=true
WAITING_ROOM_ENABLED=true
WAITING_ROOM_MAX_ACTIVE=200
```

Run: `npm run dev -w server` and `npm run worker` (plus the client).

## Design notes

**Redis is fast, MongoDB is the arbiter.** A Redis hold is a lock with a TTL, not the sale. Confirmation still does `AVAILABLE → BOOKED` conditionally inside a MongoDB transaction and verifies that no *other* hold owns the seat. If Redis restarts, holds vanish (users re-select) but a seat can never be sold twice.

**Keys:** `seat:{eventId}:<seatId>` → holdId (PX TTL) and `held:{eventId}` sorted set (score = expiry) for fast availability reads. The `{eventId}` hash tag keeps all keys of an event on one cluster slot so the Lua scripts stay valid on Redis Cluster.

**Realtime fan-out across instances:** any process (API or worker) publishes to a Redis channel; each API instance emits to *its own* sockets. No sticky sessions are required for server → client pushes.

**Waiting room:** join = `ZADD NX` with an increasing sequence (re-joining never moves you back). Every 5 s the admission job removes expired admissions and pops as many users as there are free slots. The booking endpoint verifies a JWT admission token bound to user + event.

## Re-measure (fill in with real runs)

Same tests, same data, same machine as Stage 2.

| Test | Metric | Stage 1 | Stage 3 | Change |
|---|---|---|---|---|
| A (race, 1000 users) | p95 hold ms | | | |
| B (browse, 1000 VUs) | seat-availability p95 | | | |
| B | Mongo ops/s | | | |
| C (drop, 1000 users) | bookings/s | | | |
| C | hold p95 ms | | | |
| C + waiting room | error % | | | |
| All | Consistency | | | |

Only claim improvements you measured. If an optimization did **not** help, that is a valid and interesting finding - say why.
