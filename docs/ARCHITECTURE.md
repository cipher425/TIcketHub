# TicketHub - Architecture & System Design

## 1. Principles

1. **The backend decides everything that matters**: seat availability, prices, cancellation eligibility, ticket validity. The frontend only asks and displays.
2. **Correct first, fast later.** Stage 1 can never double-book a seat. Stage 2 then measures performance limits; Stage 3 fixes the ones that were measured.
3. **Seams only where change is certain.** Five interfaces exist because Stage 3 replaces their implementation:

| Seam | File | Stage 1 | Stage 3 |
|---|---|---|---|
| SeatReservationStore | `modules/seating/reservation/` | MongoDB conditional updates | Redis Lua locks + TTL (Mongo stays final arbiter) |
| Job runner | `infra/jobs/index.js` | `setImmediate` / `setInterval` | BullMQ queue + worker process |
| Domain events | `infra/events/domainEvents.js` | Node EventEmitter | Listeners enqueue jobs / publish to Redis |
| PaymentProvider | `infra/payments/` | Razorpay or Mock | same (+ reconciliation) |
| Cache | `infra/cache.js` | `none` | `memory` / `redis` |

## 2. Modular monolith

One deployable Express app, split into modules. Each module owns its **routes → controller → service → model**. Rule: other modules call a module's **service functions**; they never write to another module's model directly for business state changes. Small modules (users, tickets, notifications) keep their tiny handlers in the routes file.

Why not microservices? One developer, one database, no independent scaling need proven yet. A monolith with clean boundaries is faster to build, easier to debug, and can be split later along the same module lines if measurements ever justify it.

## 3. Data model

Rule of thumb: **embed what is read and written together and bounded; separate what is written independently, concurrently, or unbounded.**

| Collection | Purpose | Key relations / notes | Important indexes |
|---|---|---|---|
| `users` | Accounts, role `USER/ORGANIZER/ADMIN`, status | `organizerProfile` embedded (1:1, small) | `email` unique |
| `sessions` | Refresh tokens (hashed) per device | → user | `tokenHash` unique, TTL on `expiresAt` |
| `venues` | Reusable layout template | → organizer; `layout.sections[].rows[].seats[]` embedded (≤ 5000 seats, never written concurrently) | `organizer` |
| `events` | Event info, policies, denormalized counters | → organizer, venue; copies `venueName`, `city` for listing without joins | `{status, moderation, cityKey, startsAt}`, category, popularity, minPrice |
| `tickettypes` | Price categories and which sections they cover | → event | `event` |
| `eventseats` | **One document per seat per event** - the contended collection | → event, ticketType, booking; `status`, `holdId`, `holdExpiresAt` | `{event, label}` unique, `{event, status}`, `holdId` |
| `bookings` | An order; embeds `items[]` with **price snapshots** | → user, event, organizer | partial unique `{user, event}` where `isActiveHold`, `{status, holdExpiresAt}` |
| `payments` | One doc per payment **attempt** | → booking | `providerOrderId` unique, `providerPaymentId` unique sparse |
| `webhookevents` | Idempotent webhook processing | - | `eventId` unique, TTL 30d |
| `tickets` | One per seat of a confirmed booking | → booking, event, user, seat; `ticketCode` (QR) | `ticketCode` unique |
| `notifications` | In-app notifications | → user; `dedupeKey` | `{user, createdAt}`, `dedupeKey` unique sparse |
| `coupons` | Discounts | optional → event | `code` unique |

**Why EventSeat is separate:** thousands of concurrent holds would all write one Event document if seats were an array inside it (a write hotspot), and large venues approach the 16 MB document limit. Separate small documents let MongoDB update different seats in parallel, and single-document updates are atomic.

**Why Venue layout vs EventSeat:** the physical layout is reused by many events; seat *status* belongs to one event. Publishing an event copies the layout into EventSeat documents (a snapshot - later venue edits never change a live event).

## 4. Seat holds (Stage 1)

```
POST /bookings {eventId, seatIds}
 1. validate: event bookable, seats belong to event, count <= max, not BOOKED/BLOCKED
 2. one active hold per user per event (old selection is released)
 3. price items from the DB (never from the request)
 4. ONE atomic updateMany:
      filter  _id in seatIds AND (status=AVAILABLE OR (status=HELD AND holdExpiresAt<now))
      update  status=HELD, holdId=<bookingId>, holdExpiresAt=now+5min
 5. modifiedCount < n  -> someone won a seat -> undo our partial hold -> 409 SEATS_UNAVAILABLE
 6. create Booking(PENDING) with the same _id as holdId
```

- **Why it's safe:** each seat's check-and-set is one atomic operation, so two buyers can never both flip the same seat to HELD.
- **Why not a transaction here:** under contention transactions produce write-conflict retry storms; the compensating undo is cheaper. If the server dies between steps 4 and 6, the seats become free on their own after 5 minutes (lazy expiry).
- **Lazy expiry:** every read and every hold treats `HELD && holdExpiresAt < now` as free. Correctness never depends on a background job.
- **Sweeper job (30 s):** moves stale bookings to `EXPIRED`, tidies seat documents, and first asks the gateway whether money arrived for `PAYMENT_PROCESSING` bookings (reconciliation).
- **Grace period:** creating a payment order extends the hold once (≥ 3 min left) so users aren't cut off at the bank page.

## 5. Booking state machine

```
            create hold
                 │
   RELEASED ◄─ PENDING ◄──────────┐ payment failed (retry while hold valid)
                 │                │
                 ▼                │
          PAYMENT_PROCESSING ─────┘
                 │
      ┌──────────┼──────────────┐
      ▼          ▼              ▼
  CONFIRMED   EXPIRED        FAILED (paid, but seats lost → full refund)
      │          └─► CONFIRMED / FAILED   (late payment reconciliation)
      ▼
  CANCELLED
```

All transitions go through `bookingStateMachine.transition()`: it validates the move against the transition table and performs a **conditional update** (`{_id, status: <what we read>}`), so concurrent writers (browser verify + webhook) cannot both apply.

## 6. Confirmation (one MongoDB transaction)

`payment CREATED→CAPTURED` + `booking → CONFIRMED` + `seats HELD→BOOKED` + `tickets inserted` + `event.seatsSold += n` + `coupon.usedCount += 1` - all or nothing.

Outcomes: `CONFIRMED` · `ALREADY_PROCESSED` (same payment twice: no-op) · `DUPLICATE_PAYMENT` (second payment for a settled booking: refund it) · `SEATS_LOST` (late payment, seat taken: booking FAILED + full refund).

## 7. Payment flow

```
Browser ── POST /bookings/:id/payment-order ──► API ── orders.create(amount from DB) ──► Razorpay
Browser ◄──────────── orderId, keyId ─────────── API
Browser ── Razorpay Checkout ──► Razorpay ── handler(order_id, payment_id, signature)
Browser ── POST /payments/verify ──► API: HMAC(order_id|payment_id, secret) == signature ? → confirm
Razorpay ── POST /payments/webhooks/razorpay (raw body HMAC) ──► API → confirm (idempotent)
```

Handled: failure / cancel (booking back to PENDING, retry allowed) · refresh during payment (checkout page polls booking state) · duplicate clicks (open order reused) · duplicate delivery (unique IDs + state machine) · closed tab (webhook + reconciliation job) · forged signatures (400).

## 8. Tickets & check-in

- QR content: `TH1.<ticketCode>` where `ticketCode` is 128 random bits. No personal data in the QR; it cannot be guessed.
- `POST /organizer/events/:id/check-ins/verify` - read-only: VALID / ALREADY_USED / INVALID / WRONG_EVENT / CANCELLED.
- `POST /organizer/events/:id/check-ins` - atomic `ACTIVE → USED` conditional update; two gates cannot admit the same ticket.

## 9. Cancellation

`evaluateCancellation()` is a pure function: confirmed booking, event not started, no ticket used, policy allows, best qualifying tier (e.g. 72h → 100%, 24h → 50%). Refund = ticket value × %; fees are non-refundable. The quote endpoint shows it; the cancel endpoint **re-evaluates** it. DB changes (booking, tickets, seats reopened, counters, `REFUND_PENDING`) commit in one transaction; the gateway refund call happens after commit and is retried by a job if it fails.

Organizer cancels an event → background job cancels every confirmed booking with a 100% refund and notifies holders.

## 10. Auth & security

- Access JWT (15 min) in memory; refresh token (random, hashed in DB) in an `httpOnly` cookie scoped to `/api/v1/auth`, **rotated** on every use, reuse detection revokes all sessions.
- `requireAuth` re-loads the user on each request (role changes / suspensions apply instantly). `requireRole` per router. **Ownership checks inside services** prevent IDOR.
- Zod validation strips unknown keys and enforces types → blocks NoSQL operator injection.
- Helmet, strict CORS, rate limits (auth, holds, global), request IDs, structured logs without secrets, centralized error handler.

## 11. API (prefix `/api/v1`)

| Area | Endpoints |
|---|---|
| Config | `GET /config` |
| Auth | `POST /auth/register` `POST /auth/login` `POST /auth/refresh` `POST /auth/logout` `GET /auth/me` |
| Me | `PATCH /users/me` `PATCH /users/me/password` `POST /users/me/organizer-application` |
| Catalog | `GET /catalog/home?city=` `GET /catalog/cities` `GET /catalog/categories` |
| Events | `GET /events?q&city&category&from&to&minPrice&maxPrice&sort&page&limit` `GET /events/:idOrSlug` `GET /events/:id/seat-layout` `GET /events/:id/seat-availability` |
| Waiting room | `POST /waiting-room/:eventId/join` `GET /waiting-room/:eventId/status` `POST /waiting-room/:eventId/leave` |
| Bookings | `POST /bookings` `GET /bookings?scope=upcoming\|past\|active` `GET /bookings/active?eventId` `GET /bookings/:id` `GET /bookings/:id/tickets` `POST /bookings/:id/release` `PATCH /bookings/:id/coupon` `POST /bookings/:id/payment-order` `GET /bookings/:id/cancellation-quote` `POST /bookings/:id/cancel` |
| Payments | `GET /payments/config` `POST /payments/verify` `POST /payments/failure` `POST /payments/mock/checkout` (mock only) `POST /payments/webhooks/razorpay` |
| Tickets | `GET /tickets?scope` `GET /tickets/:id` |
| Notifications | `GET /notifications` `GET /notifications/unread-count` `PATCH /notifications/:id/read` `POST /notifications/read-all` |
| Organizer | `GET /organizer/overview` `GET /organizer/bookings` · venues: `GET/POST /organizer/venues` `POST /organizer/venues/layout-preview` `GET/PATCH/DELETE /organizer/venues/:id` · events: `GET/POST /organizer/events` `GET/PATCH/DELETE /organizer/events/:id` `PUT /organizer/events/:id/ticket-types` `GET /organizer/events/:id/seat-map` `PUT /organizer/events/:id/seating` `POST /organizer/events/:id/{publish,unpublish,cancel}` `GET /organizer/events/:id/analytics` `POST /organizer/events/:id/check-ins/verify` `POST /organizer/events/:id/check-ins` |
| Admin | `GET /admin/stats` `GET /admin/users` `PATCH /admin/users/:id` `GET /admin/organizer-applications` `POST /admin/organizer-applications/:id/{approve,reject}` `GET /admin/events` `POST /admin/events/:id/moderate` |

Envelope: `{ data, meta? }` on success, `{ error: { code, message, details? } }` on failure. Status codes: 400 validation, 401 auth, 403 role/ownership, 404, 409 conflicts (`SEATS_UNAVAILABLE`, invalid transitions), 410 `HOLD_EXPIRED`, 429 rate limit.

**Why role-scoped routers** (`/organizer/events` vs `/events`): the public API can *never* leak drafts, and each router's authorization is obvious from its prefix.

**Why seat layout and availability are separate endpoints:** layout is large and static (cacheable/CDN); availability is small and changes constantly (the hot path Stage 3 moves to Redis + Socket.IO) - no API change needed.
