# Stage 2 - Load Testing (find the real problems)

Goal: measure how the **Stage 1** architecture behaves under load, and find the actual bottlenecks before optimizing anything.

> **Do not invent results.** Every number in the tables below must come from a run you did. Always record the environment next to the numbers.

## 0. Setup

1. Install k6: `winget install k6` (Windows) / `brew install k6` / see k6.io.
2. Use a **dedicated test database** (not your demo DB).
3. Server `.env` for load tests:
   ```
   NODE_ENV=production        # quieter logs
   PAYMENT_PROVIDER=mock      # never load-test a real gateway
   RATE_LIMIT_ENABLED=false   # all virtual users share your IP
   BCRYPT_ROUNDS=10           # optional; note it in the results if you change it
   ```
4. `npm run seed` and pick an event id: `GET /api/v1/events?sort=popularity&limit=1`.
5. Record the environment:

| Item | Value |
|---|---|
| Machine (CPU / RAM) | |
| Node version | |
| MongoDB (Atlas tier / local Docker) | |
| API instances | 1 |
| Stage 1 flags | RESERVATION_STORE=mongo, QUEUE_DRIVER=inline, CACHE_DRIVER=none |

Watch the database while tests run: Atlas → Metrics (operations, CPU, connections) or `mongostat` / `mongotop` for local MongoDB.

## 1. Test A - Hot-seat race (correctness under contention)

"100 users try to reserve the same seat."

```bash
npm run race -- --users 100
npm run race -- --users 500
npm run race -- --users 1000
```

Expected for a correct system: **1 × 201**, the rest **409 SEATS_UNAVAILABLE**, and `active bookings holding <seat>: 1`.

| Users | 201 | 409 | Other errors | p50 ms | p95 ms | p99 ms | Wall time ms | PASS? |
|---|---|---|---|---|---|---|---|---|
| 100 | | | | | | | | |
| 500 | | | | | | | | |
| 1000 | | | | | | | | |

## 2. Test B - Browse storm (read load)

Many users open the event page and keep the seat map open (it polls availability every 10 s).

```bash
k6 run -e BASE=http://localhost:5000 -e EVENT=<id> -e PEAK=100  load-tests/k6/browse.js
k6 run -e BASE=http://localhost:5000 -e EVENT=<id> -e PEAK=1000 load-tests/k6/browse.js
k6 run -e BASE=http://localhost:5000 -e EVENT=<id> -e PEAK=5000 load-tests/k6/browse.js
```

From the k6 summary, per endpoint (`http_req_duration{name:...}`):

| Peak VUs | Req/s | Error % | home p95 | details p95 | seat-layout p95 | seat-availability p95 | Mongo ops/s | API CPU % |
|---|---|---|---|---|---|---|---|---|
| 100 | | | | | | | | |
| 1000 | | | | | | | | |
| 5000 | | | | | | | | |

## 3. Test C - Ticket drop (write load, end-to-end)

Each virtual user registers, reads the seat map, holds 2 seats near the front (everyone wants the best seats), pays with the mock gateway and verifies.

```bash
k6 run -e BASE=http://localhost:5000 -e EVENT=<id> -e USERS=100  load-tests/k6/ticket-drop.js
k6 run -e BASE=http://localhost:5000 -e EVENT=<id> -e USERS=500  load-tests/k6/ticket-drop.js
k6 run -e BASE=http://localhost:5000 -e EVENT=<id> -e USERS=1000 load-tests/k6/ticket-drop.js
cd server && node scripts/check-consistency.js <eventId>
```

| Users | holds_succeeded | holds_conflicted | bookings_confirmed | hold p95 ms | checkout e2e p95 ms | Error % | Setup (register) time | Consistency PASS? |
|---|---|---|---|---|---|---|---|---|
| 100 | | | | | | | | |
| 500 | | | | | | | | |
| 1000 | | | | | | | | |

Re-seed between runs (`npm run seed`) so every run starts with the same inventory.

## 4. Hypotheses to confirm or reject

Write down what you *expect*, then see if the data agrees.

| # | Hypothesis | How to check | Confirmed? |
|---|---|---|---|
| H1 | Holds stay **correct** at every load (never 2 winners) | Test A + consistency checker | |
| H2 | `seat-availability` polling dominates read load | Test B req/s per endpoint | |
| H3 | Every availability poll queries MongoDB (no cache) → DB ops grow linearly with viewers | Mongo ops/s vs VUs | |
| H4 | Hold contention raises hold p95 (write conflicts on the same seat docs) | Test C hold p95 vs users | |
| H5 | Registration/login is CPU-bound (bcrypt) and blocks the event loop | Test C setup time, API CPU | |
| H6 | A single Node process saturates one CPU core | API CPU % in Test B | |
| H7 | In-memory rate limits / jobs don't work with more than one instance | Reasoning + Stage 3 multi-instance run | |

## 5. Findings (fill in)

| Bottleneck found | Evidence (numbers) | Stage 3 change |
|---|---|---|
| | | |

## 6. How to read results

- **409 is not an error** in these tests - it is the system correctly refusing a taken seat.
- Look at **p95/p99**, not averages.
- If error % rises, check whether errors are 5xx (server overloaded), timeouts, or connection refused (OS / pool limits).
- A free Atlas M0 cluster has operation and connection limits; the database, not your code, may be the limit - say so.
- Your laptop runs both k6 and the API: for big runs, run k6 from another machine if you can.
