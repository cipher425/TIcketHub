# Deployment (free tiers)

## 1. MongoDB Atlas
1. Create a free **M0** cluster (it is a replica set, so transactions work).
2. Database Access → create a user. Network Access → allow your API host (or `0.0.0.0/0` for a demo).
3. Copy the connection string into `MONGODB_URI` (add a database name, e.g. `/tickethub`).

## 2. API on Render (or Railway)
- New **Web Service** from your GitHub repo, **root directory `server`**.
- Build: `npm install` · Start: `npm start` · Node 20+.
- Environment variables (from `server/.env.example`):
  ```
  NODE_ENV=production
  MONGODB_URI=...
  CLIENT_URL=https://your-app.vercel.app
  JWT_ACCESS_SECRET=<48+ random bytes>
  ADMISSION_TOKEN_SECRET=<another random secret>
  COOKIE_SECURE=true
  COOKIE_SAMESITE=lax        # with the Vercel rewrite below (same-site)
  PAYMENT_PROVIDER=razorpay  # or mock
  RAZORPAY_KEY_ID=rzp_test_...
  RAZORPAY_KEY_SECRET=...
  RAZORPAY_WEBHOOK_SECRET=...
  ```
- Seed once from your machine with `MONGODB_URI` pointing to Atlas: `npm run seed`.
- Free Render instances sleep when idle - the first request can take ~30 s.

## 3. Frontend on Vercel
- Import the repo, **root directory `client`**, framework Vite.
- Edit `client/vercel.json` and replace `YOUR-API.onrender.com` with your API host.
  This rewrite makes the browser call `https://your-app.vercel.app/api/...`, so the refresh cookie is **first-party** (no third-party-cookie problems, `SameSite=lax` works).
- Leave `VITE_API_URL` empty. For Stage 3 sockets set `VITE_SOCKET_URL=https://your-api.onrender.com` (Vercel rewrites don't proxy WebSockets) and add the Vercel domain to `CLIENT_URL`.

*Alternative without the rewrite:* set `VITE_API_URL=https://your-api.onrender.com/api/v1`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`. Some browsers block third-party cookies, so the rewrite is preferred.

## 4. Razorpay (test mode)
1. Dashboard → switch to **Test Mode** → API Keys → generate `key_id` / `key_secret`.
2. Settings → Payment capture → **automatic** (the server also captures authorized payments as a fallback).
3. Webhooks → URL `https://your-api.onrender.com/api/v1/payments/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: `payment.captured`, `payment.failed`, `refund.processed`.
4. Test cards and UPI IDs: see Razorpay's "Test card details" docs (e.g. UPI `success@razorpay`).

Local webhooks: `cloudflared tunnel --url http://localhost:5000` and register the tunnel URL.

## 5. Redis for Stage 3 (optional)
Upstash free Redis → copy the `rediss://` URL into `REDIS_URL`. Run the worker as a separate Render **Background Worker** (`npm run worker`, root `server`) with the same env.

## 6. Checklist before sharing the link
- [ ] `npm test` passes
- [ ] Demo accounts work on the deployed site
- [ ] Payment test succeeds and the booking shows tickets
- [ ] Webhook deliveries show 200 in the Razorpay dashboard
- [ ] Secrets are only in the hosting dashboards, never committed (`.env` is git-ignored)
