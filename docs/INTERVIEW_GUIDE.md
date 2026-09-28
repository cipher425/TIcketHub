# TicketHub - Interview Guide (explained in easy words)

This guide explains **every technology, concept and design decision** in TicketHub the way you would explain it to an interviewer: simply, honestly, and with the "why".

How to use it:
1. Learn the **pitch** (section 1) until you can say it naturally.
2. Practise the **demo walkthrough** (section 2) with the app running.
3. Read the **deep-dive questions** (section 5) - these are the ones interviewers love.
4. Skim the **technology cards** (section 3) and **concepts** (section 4) so no buzzword surprises you.
5. Before an interview, fill in **your real Stage 2 numbers** (section 6). Never quote numbers you did not measure.

---

## Table of contents

1. [The pitch](#1-the-pitch)
2. [Demo walkthrough (5 minutes)](#2-demo-walkthrough-5-minutes)
3. [Technology cards - what, why, where](#3-technology-cards---what-why-where)
4. [Core concepts in plain English](#4-core-concepts-in-plain-english)
5. [Deep-dive questions (most important)](#5-deep-dive-questions-most-important)
6. [Stage 2 & 3 - the scalability story](#6-stage-2--3---the-scalability-story)
7. [Trade-offs and known limitations](#7-trade-offs-and-known-limitations)
8. [Rapid-fire questions](#8-rapid-fire-questions)
9. [Code map - where things live](#9-code-map---where-things-live)
10. [Glossary](#10-glossary)

---

## 1. The pitch

### 30-second version

> "I built TicketHub, a full-stack event ticketing platform like BookMyShow, using React, Node.js, Express and MongoDB. Users pick exact seats on a live seat map, seats are held for five minutes while they pay through Razorpay, and they get QR-code tickets that organizers scan at the gate. Organizers get dashboards with sales and attendance analytics. After building it, I load-tested the booking flow, found the bottlenecks, and added Redis seat locks, background workers, real-time updates and a virtual waiting room for high-demand ticket drops."

### 2-minute version (add these points)

- **The hard problem**: many people clicking the same seat at the same moment. My system guarantees a seat can never be sold twice - the database does an atomic "check and grab" per seat.
- **Real business logic, not CRUD**: a booking state machine (PENDING → PAYMENT_PROCESSING → CONFIRMED, plus EXPIRED / FAILED / CANCELLED), server-side pricing with GST and coupons, a cancellation policy engine with refund tiers, webhook handling, and refunds.
- **Security**: JWT access tokens + rotating refresh tokens in httpOnly cookies, role-based access checked on the server, ownership checks, input validation that blocks NoSQL injection, rate limiting.
- **Built in stages on purpose**: Stage 1 is a clean modular monolith. I designed "seams" (interfaces) so that in Stage 3 I could switch seat holds from MongoDB to Redis, or jobs from in-process to BullMQ, **with a config flag instead of a rewrite**.
- **Measured, not guessed**: I used k6 and a custom race script to measure latency, throughput and consistency before and after the optimizations.

---

## 2. Demo walkthrough (5 minutes)

Run `npm run seed` then `npm run dev`. Keep three browser profiles: customer, organizer, admin.

1. **Home page** - featured/popular/upcoming rails, categories, city selector. *Say:* "All of this comes from one cached endpoint, and filters are stored in the URL so results are shareable."
2. **Search** - type slowly in Explore. *Say:* "Search is debounced - the API is called 350 ms after you stop typing, not on every keystroke."
3. **Event page** - ticket categories with live availability and cancellation policy. *Say:* "Availability is computed by the server with an aggregation over seat documents."
4. **Seat map** - select seats. *Say:* "The seat map is not hardcoded. The organizer described sections and rows, the server generated coordinates, and React renders an SVG from that data."
5. **Race demo** - open the same event in two browsers, select the same seat in both, click Proceed in both. One goes to checkout, the other gets "Sorry, seats were just taken". *Say:* "That's the atomic hold."
6. **Checkout** - countdown timer, apply `WELCOME10`, pay. *Say:* "The price was calculated on the server when the seats were held; the browser never sends a price."
7. **Ticket** - QR code, print. *Say:* "The QR contains only a random 128-bit code, no personal data."
8. **Organizer** - dashboard charts → event → Check-in → paste the QR text (`TH1.<code>` from the ticket) → Admit → try again → "Already used".
9. **Cancel** - as the customer, cancel a booking → see refund preview → confirm → seat becomes free again.
10. **Admin** - approve the pending organizer, suspend an event.

---

## 3. Technology cards - what, why, where

Each card: **What** (one line) · **Why I chose it** · **Where it's used** · **Likely questions**.

### Frontend

#### React
- **What**: a JavaScript library to build UIs from reusable components that re-render when state changes.
- **Why**: industry standard, huge ecosystem, component model fits screens like seat maps and dashboards.
- **Where**: `client/src` - organized by *feature* (`features/booking`, `features/seating` ...) instead of by file type.
- **Q: What is the virtual DOM?** React keeps a lightweight copy of the UI in memory, compares the new copy with the old one ("diffing") and updates only the changed parts of the real DOM.
- **Q: Why `memo` on the Seat component?** A venue can have thousands of seats. `memo` skips re-rendering a seat whose props didn't change, so clicking one seat doesn't redraw all of them.
- **Q: What are hooks?** Functions like `useState`, `useEffect` that let function components have state and side effects. I wrote custom hooks: `useDebounce`, `useCountdown`, `useSeatData`.

#### Vite
- **What**: a build tool and dev server.
- **Why**: instant startup and hot reload (it serves ES modules directly in dev), much faster than Create React App (which is deprecated).
- **Where**: `client/vite.config.js` - also **proxies `/api` to the backend** in development so the browser sees one origin (no CORS issues, cookies work).

#### Tailwind CSS
- **What**: utility-first CSS - you style with small classes like `px-4 rounded-xl`.
- **Why**: fast to build a consistent, responsive design without writing separate CSS files; unused styles are removed in production.
- **Where**: everywhere; theme colours in `client/src/index.css` (`@theme`). Print styles for tickets use `@media print`.

#### React Router
- **What**: client-side routing (URL → page) without full page reloads.
- **Where**: `client/src/app/router.jsx`. Nested layouts (public, account, organizer, admin) and **route guards** (`RequireAuth`, `RequireRole`).
- **Q: Are route guards security?** No - they are only UX. Anyone can edit frontend code. The real protection is the backend checking the token, role and ownership on every request.

#### TanStack Query (React Query)
- **What**: a library for **server state**: fetching, caching, refetching, loading/error states.
- **Why**: without it you write the same `useEffect + useState + loading + error` code everywhere. It also gives caching, polling and background refresh for free.
- **Where**: every API read. Examples:
  - Seat availability **polls every 10 s** in Stage 1 (`refetchInterval`).
  - Checkout **polls while payment is processing** (in case the webhook confirms it).
  - `keepPreviousData` keeps old search results visible while new ones load (no flicker).
- **Q: Server state vs client state?** Server state lives on the server and can go stale (events, bookings) - React Query manages it. Client state is local UI (selected seats, open dialog) - plain `useState`.

#### Axios
- **What**: HTTP client.
- **Why**: interceptors - I use them to attach the access token and to **automatically refresh an expired token and retry the request**.
- **Where**: `client/src/lib/api.js`. The refresh is **single-flight**: if five requests fail at once, only one refresh call is made (important because refresh tokens rotate).

#### React Hook Form + Zod
- **What**: form state management + schema validation.
- **Why**: forms re-render less, validation rules are declarative, and I use **Zod on both frontend and backend**.
- **Q: If you validate on the frontend, why again on the backend?** Frontend validation is for user experience; backend validation is for security. Requests can be sent without the frontend (Postman, curl).

#### Recharts, qrcode.react, html5-qrcode, sonner
- **Recharts**: charts in organizer/admin dashboards (sales over time, revenue by category, occupancy).
- **qrcode.react**: renders the ticket QR as SVG in the browser.
- **html5-qrcode**: camera QR scanning on the check-in page.
- **sonner**: toast notifications.

### Backend

#### Node.js
- **What**: JavaScript runtime on the server, built on Chrome's V8 engine.
- **Why**: same language front and back; excellent at I/O-heavy work (APIs waiting on databases), thanks to its **event loop**.
- **Q: Node is single-threaded - how does it handle many users?** JavaScript runs on one thread, but I/O (database, network) is non-blocking: while waiting for MongoDB, Node serves other requests. CPU-heavy work (like bcrypt hashing) *does* block, which is why I measure login storms in Stage 2 and why scaling uses multiple processes (PM2 cluster).

#### Express 5
- **What**: minimal web framework for Node: routing + middleware.
- **Why**: simple, widely known. Express 5 automatically forwards errors from `async` handlers to the error middleware, so no try/catch in every route.
- **Where**: `server/src/app.js` builds the app; each module has a router.
- **Q: What is middleware?** A function that runs between the request arriving and the response being sent: `(req, res, next)`. Mine: logging → security headers → CORS → rate limit → auth → validation → handler → error handler.

#### MongoDB
- **What**: a document database - stores JSON-like documents in collections.
- **Why**: flexible schemas suit events with varied policies and nested layouts; embedding lets me read a venue layout or a booking in one query; supports **multi-document ACID transactions** (on a replica set), which the confirmation step needs.
- **Q: Why not SQL (PostgreSQL)?** Honestly, Postgres would also work well - ticketing is quite relational. I chose MongoDB because the brief was MERN, and I compensated for its weaker joins by designing collections carefully (denormalizing listing fields, embedding bounded data) and using transactions where atomicity across documents matters.
- **Q: What is a replica set and why do you need one?** A group of MongoDB servers with the same data (one primary, others secondaries) for high availability. MongoDB only allows transactions on replica sets, so even locally I run a single-node replica set. Atlas clusters are replica sets by default.

#### Mongoose
- **What**: an ODM (Object Data Modeling) library - schemas, validation, models on top of MongoDB.
- **Where**: every `*.model.js`. I use `.lean()` for read-only queries (returns plain objects, faster) and `connection.transaction()` for transactions (auto-retries on transient conflicts).

#### JWT (JSON Web Token)
- **What**: a signed token like `header.payload.signature`. The server can verify it without a database lookup.
- **Where**: `modules/auth/tokens.js`. Access token contains `sub` (user id) and `role`, expires in 15 minutes.
- **Q: Is a JWT encrypted?** No - it's *signed*, not encrypted. Anyone can read the payload (base64). The signature only proves it wasn't changed. So never put secrets in it.
- **Q: How do you log someone out if JWTs can't be revoked?** Access tokens are short-lived (15 min). Logout revokes the **refresh token** in the database, so no new access tokens can be made. I also re-load the user on every request, so a suspended user is blocked immediately.

#### bcrypt (bcryptjs)
- **What**: a password-hashing algorithm that is deliberately slow and salted.
- **Why**: if the database leaks, attackers cannot easily reverse the hashes; the salt means identical passwords have different hashes; the cost factor (12) makes brute force expensive.
- **Why bcryptjs**: same algorithm, pure JavaScript, no native build tools needed on Windows.
- **Q: Hashing vs encryption?** Encryption is reversible with a key; hashing is one-way. Passwords must be hashed.
- **Detail**: login compares against a dummy hash when the email doesn't exist, so response time doesn't reveal which emails are registered (user-enumeration protection).

#### Zod
- **What**: schema validation library.
- **Where**: `validate()` middleware on every route; also validates **environment variables at startup** (`config/env.js`) - the server refuses to start with bad config.

#### Helmet, CORS, express-rate-limit, Pino
- **Helmet**: sets security HTTP headers (e.g. `X-Content-Type-Options`, `Strict-Transport-Security`).
- **CORS**: browsers block cross-origin requests unless the server allows the origin. I allow only my frontend's origin, with credentials (cookies).
- **Rate limiting**: limits requests per IP / per user - stricter on login (brute force) and seat holds (bots).
- **Pino**: fast structured (JSON) logging with request IDs; secrets like `authorization` headers are redacted.

#### Razorpay
- **What**: Indian payment gateway (cards, UPI, netbanking), used in **test mode**.
- **Where**: `infra/payments/razorpayProvider.js`, `modules/payments/`.
- **Also**: a **mock provider** with the same interface, used for local dev, automated tests and load tests (you must never load-test a real gateway).

### Stage 3 technologies

#### Redis
- **What**: an in-memory key-value store - extremely fast (sub-millisecond), supports expiry (TTL) and atomic Lua scripts.
- **Where**: seat locks (`redisReservationStore.js`), waiting room queues, caching, shared rate-limit counters, BullMQ, Socket.IO fan-out.
- **Q: Why Redis for seat holds?** Holds are short-lived, extremely hot data. In Redis a multi-seat hold is one atomic Lua script in memory, and expiry is automatic with TTL, so the database only sees the final BOOKED write.

#### BullMQ
- **What**: a job queue built on Redis, with retries, backoff, delays and repeatable jobs.
- **Where**: `infra/jobs/index.js` (driver `bullmq`) + `src/worker.js`. Jobs: notifications, hold sweeper, refund retries, reminders, waiting-room admission, event-cancellation processing.
- **Q: Why a queue?** The API should respond fast. Slow or retryable work (sending notifications, refunding 500 bookings when an event is cancelled) goes to a worker process. If it fails, it's retried automatically.

#### Socket.IO
- **What**: real-time, two-way communication (WebSocket with fallbacks) between server and browser.
- **Where**: `infra/realtime.js`. Rooms per event (`event:<id>`) receive seat changes; rooms per user receive booking and notification updates.
- **Q: Polling vs WebSockets?** Polling = the client asks every N seconds (simple, but wasteful and always slightly stale). WebSockets = the server pushes changes the moment they happen. With 5,000 people on a seat map, polling every 10 s is 500 requests/second of mostly unchanged data.

#### k6
- **What**: a load-testing tool; you write scenarios in JavaScript and it simulates many virtual users.
- **Where**: `load-tests/k6/browse.js`, `ticket-drop.js`.

#### Vitest, Supertest, mongodb-memory-server
- **Vitest**: test runner. **Supertest**: sends HTTP requests to the Express app without starting a server. **mongodb-memory-server**: spins up a real in-memory MongoDB **replica set** so transaction code is tested for real.

---

## 4. Core concepts in plain English

**REST API** - URLs represent resources (`/bookings/123`), HTTP verbs are actions (GET read, POST create, PATCH update, DELETE remove), responses use status codes. My responses always look like `{ data, meta }` or `{ error: { code, message } }`.

**Status codes I use** - 200 OK · 201 Created · 400 bad input · 401 not logged in · 403 logged in but not allowed · 404 not found · 409 conflict (seat taken, invalid state change) · 410 gone (hold expired) · 429 too many requests · 500 server bug.

**Authentication vs Authorization** - Authentication = *who are you?* (login, token). Authorization = *what may you do?* (roles + ownership).

**RBAC (role-based access control)** - Roles USER / ORGANIZER / ADMIN. `requireRole('ORGANIZER','ADMIN')` guards the whole `/organizer` router.

**IDOR (Insecure Direct Object Reference)** - Changing an ID in the URL to access someone else's data. Prevented by ownership checks inside services: `if (booking.user !== req.user.id) throw forbidden()`.

**Access token + refresh token** - The access token is short-lived and sent with every request. The refresh token is long-lived, stored in an **httpOnly cookie** (JavaScript can't read it, so XSS can't steal it), and only used to get new access tokens.

**Refresh token rotation & reuse detection** - Every refresh gives a *new* refresh token and kills the old one. If an old one is ever used again, someone probably stole it, so the server revokes **all** sessions of that user. (A 10-second grace window avoids false alarms when two tabs refresh at the same moment.)

**XSS / CSRF**
- XSS: attacker runs JavaScript in your page. Mitigation: React escapes output; tokens not in localStorage.
- CSRF: another site makes your browser send a request with your cookies. Mitigation: the only cookie is the refresh token, scoped to `/api/v1/auth` with `SameSite`; all other endpoints need the `Authorization` header, which another site cannot add.

**NoSQL injection** - Sending `{"email": {"$gt": ""}}` to trick a query. Zod forces `email` to be a string, so the operator never reaches MongoDB (there's a test for this).

**Middleware pipeline** - A request passes through a chain of small functions, each doing one job.

**Modular monolith** - One application, but internally split into modules with clear boundaries. Simpler than microservices; can be split later if needed.

**Service layer** - Controllers handle HTTP (read request, send response). Services hold business rules. This keeps rules reusable (the seed script and tests call the same services) and testable.

**Index** - A sorted lookup structure (like a book index) so queries don't scan every document. Example: `{event, label}` unique index guarantees a seat label exists once per event and makes lookups instant.

**Compound & partial indexes** - Compound: an index on several fields in order (`status, cityKey, startsAt` matches the discovery query). Partial: indexes only documents matching a filter. My partial unique index `{user, event}` where `isActiveHold: true` means **a user can only have one active hold per event - enforced by the database itself**.

**TTL index** - MongoDB automatically deletes documents after a time (used for expired sessions and old webhook records). *Not* used for seat holds because TTL deletes documents - we need to *update* the seat back to AVAILABLE.

**Denormalization** - Copying data to avoid joins (event stores `venueName` and `city`; bookings store `eventTitle`). Faster reads, at the cost of keeping copies in sync (I update booking dates if an event is rescheduled).

**Snapshot** - Copying values that must not change later: booking items store the **price at the time of booking**, and tickets store seat/event details.

**Atomic operation** - Happens completely or not at all, and nobody can see or interfere halfway. A single-document update in MongoDB is atomic.

**Race condition** - A bug where the result depends on timing. Classic example: two users read "seat available" at the same time, both write "booked". Fixed by doing check + write in one atomic step.

**Transaction (ACID)** - Several operations that succeed or fail together. Atomic, Consistent, Isolated, Durable. Used when confirming a booking (payment + booking + seats + tickets + counters).

**Optimistic concurrency** - Don't lock anything; when writing, include the value you read in the filter (`status: 'PENDING'`). If someone changed it meanwhile, your write matches nothing and you know you lost the race.

**Idempotency** - Doing something twice has the same effect as doing it once. Payments must be idempotent: verify + webhook, double clicks and retries must never create two bookings or charge twice.

**State machine** - A fixed set of states and the allowed moves between them. It stops impossible situations like "CANCELLED → CONFIRMED" and puts all status logic in one file.

**Webhook** - The payment provider calls *your* server when something happens (payment captured, refund processed). It's the reliable channel - the browser may close before telling you anything.

**HMAC signature** - A hash of the data combined with a secret key. Razorpay signs `order_id|payment_id` with my secret; I recompute it and compare. If they match, the data really came from Razorpay and wasn't altered. I compare with `timingSafeEqual` to avoid timing attacks.

**Money in integer paise** - ₹499.99 is stored as `49999`. Floating-point numbers can't represent decimals exactly (`0.1 + 0.2 = 0.30000000000000004`), which is unacceptable for money.

**Pagination** - Returning results in pages (`page`, `limit`, `total`). I use offset pagination (`skip/limit`); for very deep pages, cursor pagination would be faster.

**Debouncing** - Waiting until the user stops typing before calling the API.

**Caching** - Keeping a copy of expensive results for a while. The seat *layout* (static) is cacheable; seat *availability* (changes constantly) isn't.

**Rate limiting** - Capping requests per client per time window to stop abuse and protect the system.

**Queue / worker** - The API puts a job in a queue and responds immediately; a separate worker process does the job later, with retries.

**Horizontal vs vertical scaling** - Vertical: a bigger machine. Horizontal: more machines/processes behind a load balancer. Horizontal scaling needs **shared state** (Redis) - in-memory counters or holds in one process are invisible to the others.

**Load testing metrics**
- *Throughput*: requests (or bookings) per second.
- *Latency p50/p95/p99*: 95% of requests were faster than the p95 value. Averages hide the slow tail; p95/p99 show what unlucky users feel.
- *Error rate*: % of requests that failed (5xx, timeouts). Note: a 409 "seat taken" is a **correct** answer, not an error.
- *Consistency*: did we ever double-book? (Checked by `check-consistency.js`.)

**Virtual waiting room** - When demand is huge, don't let everyone hit the booking system at once. Put them in a fair FIFO queue and let a fixed number in at a time.

---

## 5. Deep-dive questions (most important)

### Q1. How do you make sure two people can't book the same seat?

"Each seat of each event is its own MongoDB document with a `status`. To hold seats I run a **single atomic `updateMany`** whose filter says 'only seats that are AVAILABLE (or whose hold has expired)' and whose update sets them to HELD with my hold ID. MongoDB applies the check and the change as one atomic step per document, so if 100 users try at the same moment, exactly one matches the filter. Everyone else's update matches zero documents and they get a 409 'seat just taken'.

For multiple seats it's all-or-nothing: if I asked for 3 and only got 2, I immediately undo the 2. I tested it: 30 concurrent holds on one seat in an integration test, and up to hundreds with the race script - exactly one winner every time."

**Follow-up: why not read first, then write?** "That's the classic race: both users read 'available', both write 'held'. The check and the write must be one operation."

**Follow-up: why not a transaction for the hold?** "The atomic update already gives correctness. Transactions under heavy contention cause write-conflict retries, which would make the hot path slower. I use a transaction only where several documents must change together - the confirmation."

### Q2. How do temporary holds expire?

"Each held seat has `holdExpiresAt`. Two layers:
1. **Lazy expiry** - every availability read and every hold attempt treats an expired hold as free. So even if no background job ran, seats become available exactly on time. Correctness never depends on a cron job.
2. **A sweeper job** every 30 seconds marks those bookings as EXPIRED so the user sees the right status, and tidies the seat documents.

In Stage 3 with Redis, the lock itself has a TTL, so Redis removes it automatically."

### Q3. What if the payment succeeds but the hold has already expired?

"Real-world case - a slow bank page. When the payment arrives, the confirmation transaction tries to turn the seats to BOOKED **only if they're still mine or still free**. If they're still free, I honour the payment - the state machine allows EXPIRED → CONFIRMED for this 'late payment'. If someone else has taken a seat, the transaction aborts, the booking becomes FAILED, a **full refund** is triggered automatically, and the user gets a notification explaining it. There's an integration test for exactly this scenario. Also, to make it rare, creating a payment order extends the hold once by a grace period."

### Q4. What happens if Razorpay sends the webhook twice, or the webhook and the browser both confirm?

"Three layers of idempotency:
1. `WebhookEvent` collection with a **unique event ID** - a re-delivered webhook is ignored.
2. The Payment update is conditional: `CREATED → CAPTURED` only matches once. The second caller gets 'ALREADY_PROCESSED'.
3. The booking transition is conditional on the current status, inside a transaction.

So no matter how many times confirmation is attempted, there is one booking, one set of tickets, one seat count increase."

### Q5. What if the user pays twice (two tabs)?

"The second payment finds the booking already CONFIRMED. I record it as captured and **automatically refund it** (outcome `DUPLICATE_PAYMENT`). Also, clicking Pay twice reuses the same open order instead of creating a new one."

### Q6. What if the user closes the tab right after paying?

"The webhook confirms the booking server-side. If the webhook is also lost, the sweeper job - before expiring a PAYMENT_PROCESSING booking - **asks Razorpay** whether that order was paid (reconciliation) and confirms it if so. When the user returns, the checkout page shows the current state; while it's PAYMENT_PROCESSING it polls every few seconds."

### Q7. How is the price protected from tampering?

"The browser only sends seat IDs. The server looks up each seat's ticket type and price in the database, computes subtotal, convenience fee, 18% GST on the fee, coupon discount and total, and stores it on the booking as a snapshot. The Razorpay order is created by the server for that stored total, and after payment I verify the captured amount matches. The frontend just displays what the server calculated."

### Q8. Walk me through the booking state machine.

"PENDING means seats are held and the user is at checkout. When they start paying it becomes PAYMENT_PROCESSING. Success → CONFIRMED. Failure → back to PENDING so they can retry while the hold lasts. Timeout → EXPIRED. User leaves → RELEASED. Paid but seats lost → FAILED with refund. CONFIRMED → CANCELLED via the cancellation policy. All transitions go through one function that checks a transition table and does a conditional update. No controller ever sets a status directly - that's what keeps the logic understandable."

### Q9. Why did you model seats as separate documents instead of an array inside the event?

"Two reasons. Concurrency: if seats were an array in the event document, every single hold from every user would write the same document - a hotspot, and MongoDB would serialize those writes. Size: a 5,000-seat venue with statuses would be a huge document that grows toward the 16 MB limit and is expensive to rewrite. Separate small documents let the database update different seats in parallel."

**Follow-up: then why is the venue layout embedded?** "The venue layout is a template: read together, bounded in size, and never edited concurrently. The rule I follow: embed what's read and written together and bounded; separate what's written independently or concurrently."

### Q10. How does the seat map work without hardcoding?

"The organizer describes sections: name, rows, seats per row, aisle positions. A generator on the server turns that into seats with x/y coordinates in 'seat units', continuing row letters across sections so every label is unique. On publish, those seats are copied into EventSeat documents with their ticket category. The frontend fetches the layout and draws an SVG; since coordinates are in units and the SVG has a viewBox, the same data scales from a phone to a monitor. Availability comes from a separate, small endpoint."

### Q11. Why are seat layout and seat availability separate endpoints?

"Layout is big and almost never changes - it can be cached for minutes or put on a CDN. Availability is tiny (only non-available seats, as short codes like `{id, s:'B'}`) and changes every second. Splitting them means the hot path transfers very little data, and in Stage 3 I could move availability to Redis and push it with Socket.IO without changing the API."

### Q12. How do QR tickets work? What if someone screenshots and shares a ticket?

"The QR encodes `TH1.` plus a random 128-bit code - impossible to guess and with no personal information. At the gate, the organizer's app sends it to the server, which checks: does it exist, is it for this event, is it cancelled, is it already used. Admitting does an atomic update 'ACTIVE → USED' conditional on it still being ACTIVE. So if a screenshot is shared, **whoever scans first gets in, and the copy shows ALREADY USED** - even if two gates scan at the same instant. A production improvement would be rotating QR codes in the app, like airline or concert apps do."

### Q13. How does cancellation and refund work?

"The event has a policy, e.g. 100% refund if you cancel 72+ hours before, 50% at 24+ hours. A pure function evaluates it: booking must be confirmed, event not started, no ticket scanned, and it finds the best tier you still qualify for. Refund is on the ticket price; the convenience fee is non-refundable. The UI calls a quote endpoint to show the amount, but the cancel endpoint **recalculates** it - so a modified request can't get a bigger refund.

Cancellation runs in a transaction: booking CANCELLED, tickets CANCELLED, seats back to AVAILABLE for resale, sold count reduced, payment marked REFUND_PENDING. After commit I call Razorpay's refund API. If that call fails, a retry job keeps trying - the database never depends on an external HTTP call succeeding inside a transaction."

### Q14. How does authentication work end to end?

"On login the server checks the bcrypt hash, then returns a 15-minute access JWT in the response body and sets a refresh token in an httpOnly cookie. The frontend keeps the access token only in memory. Every request sends it in the Authorization header. When it expires, the Axios interceptor calls `/auth/refresh` once, gets a new pair (the refresh token rotates), and retries the original request. On page reload, the app calls refresh first to restore the session. Logout revokes the refresh token in the DB."

**Follow-up: why not localStorage?** "Any XSS bug could read localStorage and steal a long-lived token. An httpOnly cookie can't be read by JavaScript."

### Q15. How is authorization enforced?

"Three levels, all on the backend: `requireAuth` validates the token and re-loads the user (so suspensions and role changes apply immediately); `requireRole` on the organizer and admin routers; and ownership checks inside services - an organizer can only modify their own events and venues, a user can only see their own bookings and tickets. There's a test that a normal user gets 403 on organizer and admin APIs."

### Q16. What happens when an organizer cancels an event?

"The event is marked CANCELLED immediately (it disappears from sale), then a background job processes every confirmed booking: cancel with a 100% refund including fees, release any in-progress holds, and notify every ticket holder. It's a job because an event could have thousands of bookings - you don't do that inside one HTTP request."

### Q17. How do notifications work, and how would you scale them?

"Services publish **domain events** like `booking.confirmed`. A listener turns that into a notification job through a dispatcher. In Stage 1 the job runs in-process right after the request. In Stage 3 the same call puts it on a BullMQ queue and a separate worker processes it with retries. Each notification has a `dedupeKey` with a unique index, so a retried job never creates duplicates. The booking service doesn't know notifications exist - that's the decoupling."

### Q18. Why a modular monolith instead of microservices?

"Microservices solve organizational and independent-scaling problems I didn't have: one developer, one database, one deploy. They add network calls, distributed transactions and operational overhead. A monolith with clean module boundaries and interfaces at the places I expected to change gave me the same flexibility - Stage 3 swapped implementations behind interfaces without a rewrite."

### Q19. How did you make Stage 3 possible without rewriting Stage 1?

"I identified what would change and put an interface there from day one: SeatReservationStore (Mongo → Redis), a job runner (inline → BullMQ), a domain-event bus, a payment provider interface, and a cache. The booking service calls `store.hold()` and doesn't care whether that's MongoDB or a Redis Lua script. Switching is an environment variable."

### Q20. How does the Redis seat lock work? Is Redis the source of truth?

"Each seat hold is a key `seat:{eventId}:seatId` holding the hold ID with a TTL. A Lua script checks all requested seats and sets them only if none are taken - atomic, all-or-nothing, inside Redis. A sorted set per event indexes held seats by expiry for fast availability reads. The `{eventId}` hash tag keeps all keys of an event in the same Redis Cluster slot, which Lua requires.

Redis is **not** the final source of truth: the final `AVAILABLE → BOOKED` write still happens in MongoDB with a conditional update inside the confirmation transaction. So even if Redis lost data, the worst case is that a hold disappears - never a double booking."

### Q21. How does the waiting room work?

"For events flagged high-demand, users join a FIFO queue - a Redis sorted set scored by an incrementing counter. Every 5 seconds a job moves people from the queue into an 'admitted' set, keeping at most N shoppers inside at once. Admitted users receive a short-lived **signed admission token** (JWT). The seat-hold endpoint rejects requests without a valid token for that event. So instead of 10,000 people hammering the booking API, only N do, and everyone else sees their position and an estimated wait. It protects the database and is fairer than 'fastest click wins'."

### Q22. How did you test it?

"Unit tests for pure logic (pricing, cancellation tiers, state machine, layout generator). Integration tests against a real in-memory MongoDB **replica set**: concurrent holds on one seat, all-or-nothing multi-seat holds, lazy expiry, the full payment → tickets → check-in → cancellation flow, idempotent re-verification, forged signatures, late payment with seats lost. API tests with Supertest for auth, role enforcement and NoSQL injection. Then load tests with k6 and a race script, plus a consistency checker that verifies no seat is in two confirmed bookings."

### Q23. How would you scale this to millions of users?

Answer in layers - and say you'd **measure first**:
1. Static frontend on a CDN; cache seat layouts at the edge.
2. Waiting room in front of high-demand drops (controls admission rate).
3. Multiple stateless API instances behind a load balancer (state in Redis).
4. Redis for holds, rate limits, queues; Redis Cluster if one node isn't enough.
5. MongoDB: right indexes, read preference to secondaries for analytics, then sharding by `event` for the seat collection.
6. Push updates with WebSockets instead of polling.
7. Move analytics to a separate read model / warehouse so dashboards never compete with bookings.

---

## 6. Stage 2 & 3 - the scalability story

> **Rule: never invent numbers.** Run the tests in `docs/STAGE2_LOAD_TESTING.md`, record your real results in its tables, and quote only those.

How to tell the story (fill in the brackets):

> "In Stage 2 I ran three tests. First, a hot-seat race: [N] users hitting one seat at once. The system stayed correct - exactly one success and [N-1] conflicts - but p95 latency was [X ms]. Second, a browse storm with [N] virtual users polling the seat map every 10 seconds: availability requests dominated, reaching [Y req/s], and p95 rose to [Z ms] because every poll queried MongoDB. Third, a ticket drop with [N] buyers going through checkout: I got [B] bookings per second, [E]% errors, and the consistency checker confirmed zero double bookings.
>
> The bottlenecks were [e.g. availability polling load on MongoDB, hold churn writes, login CPU from bcrypt, rate limits per instance]. In Stage 3 I moved holds to Redis, cached seat layouts, replaced polling with Socket.IO pushes, moved jobs to a BullMQ worker, and added a waiting room. Re-running the same tests gave [new numbers]."

Things worth mentioning even before you have numbers (they show understanding):
- **409s are success**, not errors: they're the system correctly refusing a taken seat.
- **p95 vs average**: averages hide the users having a bad time.
- **Where the load comes from**: in a drop, *reads* (people staring at the seat map) usually dwarf *writes* (holds).
- **Test environment matters**: a laptop and a free Atlas M0 cluster have hard limits; state the setup with every number.

---

## 7. Trade-offs and known limitations

Mentioning these shows maturity - interviewers like candidates who know the weak spots.

| Topic | What I did | Limitation / next step |
|---|---|---|
| Search | Case-insensitive regex (works for search-as-you-type) | Unanchored regex can't use indexes → Atlas Search or a text index at scale |
| Pagination | Offset (`skip/limit`) | Deep pages get slower → cursor pagination |
| Seat map | Up to 5,000 seats in SVG | Stadiums (50k) → canvas rendering + section-level zoom |
| General admission | Seated events only | Standing/GA tickets need a capacity counter per ticket type |
| QR | Static random code | Rotating/time-based QR to stop screenshot sharing |
| Notifications | In-app (email is logged) | Plug in an email/SMS provider behind the dispatcher |
| Analytics | Aggregations on the live DB | Separate read model / warehouse so reports never slow bookings |
| Mongo hold store | Hold writes hit the DB | Exactly why Stage 3 adds Redis |
| Timezone | Dates shown in browser time, charts grouped in IST | Store event timezone for multi-country events |
| Images | Banner URL field | Signed uploads to Cloudinary/S3 |

---

## 8. Rapid-fire questions

- **Why Vite over CRA?** Faster dev server (native ES modules) and builds; CRA is deprecated.
- **Why Express 5?** Async errors reach the error handler automatically.
- **`lean()`?** Returns plain JS objects instead of Mongoose documents - faster for reads.
- **Why `populate` rarely?** It's an extra query; I denormalize listing fields instead.
- **What's `trust proxy`?** Behind a load balancer, `req.ip` would be the proxy's IP; this reads the real client IP from `X-Forwarded-For` (needed for rate limiting).
- **Why raw body for webhooks?** The signature is computed over exact bytes; parsing JSON and re-stringifying can change them.
- **Why `timingSafeEqual`?** A normal `===` can return early on the first different character, leaking timing information.
- **What is `SameSite`?** A cookie attribute controlling whether the browser sends the cookie on cross-site requests (`lax`, `strict`, `none`).
- **Why is the refresh cookie path `/api/v1/auth`?** It's only sent to auth endpoints - smaller attack surface.
- **What does `select: false` on passwordHash do?** It's excluded from queries unless explicitly requested.
- **How do you prevent seat hoarding?** Max seats per booking, one active hold per user per event (partial unique index), hold rate limit, 5-minute expiry, waiting room in Stage 3.
- **Why store `bookingRef` separately from `_id`?** Humans read it at counters and in emails; it avoids confusing characters (0/O, 1/I).
- **What's a hash tag in Redis keys?** `{...}` in a key decides the cluster slot; keys with the same tag live together so multi-key Lua scripts work.
- **What's `upsertJobScheduler`?** BullMQ's idempotent way to register repeatable jobs - running it from several instances doesn't create duplicates.
- **What is graceful shutdown?** On SIGTERM, stop accepting requests, finish jobs, close DB/Redis connections, then exit - no half-finished work.
- **How do you validate env vars?** A Zod schema at startup; the process exits with a clear message if anything is missing.
- **What's an ODM vs ORM?** ODM maps documents (MongoDB), ORM maps relational tables (SQL).
- **What is CORS preflight?** An automatic `OPTIONS` request the browser sends before "non-simple" cross-origin requests to ask permission.
- **Why `keepPreviousData` in the listing?** Old results stay visible while new filter results load, so the page doesn't flash empty.
- **What is `StrictMode` doing in dev?** React runs effects twice to expose side-effect bugs. My single-flight refresh makes the double call harmless.

---

## 9. Code map - where things live

| Topic | File |
|---|---|
| Env validation | `server/src/config/env.js` |
| All enums | `server/src/config/constants.js` |
| Seat hold (Stage 1) | `server/src/modules/seating/reservation/mongoReservationStore.js` |
| Seat hold (Stage 3, Lua) | `server/src/modules/seating/reservation/redisReservationStore.js` |
| Booking state machine | `server/src/modules/bookings/bookingStateMachine.js` |
| Hold / confirm / cancel logic | `server/src/modules/bookings/bookings.service.js` |
| Pricing | `server/src/modules/bookings/pricing.service.js` |
| Cancellation policy | `server/src/modules/bookings/cancellation.service.js` |
| Payments, verify, webhook | `server/src/modules/payments/payments.service.js` |
| Refunds + retry | `server/src/modules/payments/refunds.service.js` |
| Razorpay / mock gateway | `server/src/infra/payments/` |
| Layout generator | `server/src/modules/venues/layoutGenerator.js` |
| Seat inventory, layout, availability | `server/src/modules/seating/inventory.service.js` |
| QR check-in | `server/src/modules/tickets/checkin.service.js` |
| Auth + token rotation | `server/src/modules/auth/auth.service.js` |
| Auth middleware | `server/src/middleware/auth.js` |
| Background jobs | `server/src/jobs/registry.js`, `server/src/infra/jobs/index.js` |
| Waiting room | `server/src/modules/waitingRoom/` |
| Real-time | `server/src/infra/realtime.js` |
| Tests | `server/tests/` |
| Load tests | `load-tests/k6/`, `server/scripts/hot-seat-race.js`, `server/scripts/check-consistency.js` |
| Axios + refresh | `client/src/lib/api.js` |
| Seat map (SVG) | `client/src/features/seating/SeatMap.jsx` |
| Checkout + timer + Razorpay | `client/src/features/booking/CheckoutPage.jsx` |
| Organizer layout builder | `client/src/features/organizer/VenuePages.jsx` |
| Check-in scanner | `client/src/features/organizer/CheckInPage.jsx` |

---

## 10. Glossary

| Term | Meaning |
|---|---|
| ACID | Atomicity, Consistency, Isolation, Durability - guarantees of a transaction |
| Aggregation pipeline | MongoDB's multi-stage data processing (`$match`, `$group`, `$unwind` ...) used for analytics |
| Backoff | Waiting longer between each retry |
| CDN | Servers around the world that cache static files close to users |
| Consistency (here) | No seat ever sold twice; counters match reality |
| Debounce | Delay an action until input stops changing |
| Denormalize | Store copies of data to avoid joins |
| Domain event | A fact announced by the business logic, e.g. "booking.confirmed" |
| Hotspot | One document/key receiving a disproportionate share of writes |
| Idempotent | Safe to repeat - same result every time |
| Lazy expiry | Treating something as expired when it's read, instead of deleting it on time |
| Lua script (Redis) | Code that runs atomically inside Redis |
| p95 latency | 95% of requests were faster than this |
| Replica set | Group of MongoDB servers holding the same data; required for transactions |
| Snapshot | A copy of values at a moment in time (booking prices) |
| TTL | Time To Live - automatic expiry |
| Throughput | Work completed per second |
| Virtual waiting room | A fair queue that meters users into a busy system |
