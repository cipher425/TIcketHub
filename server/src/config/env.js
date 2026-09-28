import 'dotenv/config';
import { z } from 'zod';

const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(5000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    CLIENT_URL: z.string().default('http://localhost:5173'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    ADMISSION_TOKEN_SECRET: z.string().min(32).default('dev-admission-secret-change-me-please-0000'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_SECURE: bool(false),

    PAYMENT_PROVIDER: z.enum(['razorpay', 'mock']).default('mock'),
    RAZORPAY_KEY_ID: z.string().optional().default(''),
    RAZORPAY_KEY_SECRET: z.string().optional().default(''),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
    MOCK_PAYMENT_SECRET: z.string().default('mock-secret-for-local-signatures'),

    HOLD_DURATION_SECONDS: z.coerce.number().int().positive().default(300),
    PAYMENT_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(180),
    MAX_SEATS_PER_BOOKING: z.coerce.number().int().positive().default(10),
    CONVENIENCE_FEE_PER_TICKET: z.coerce.number().int().nonnegative().default(3000),
    TAX_RATE_BPS: z.coerce.number().int().nonnegative().default(1800),

    RUN_JOBS: bool(true),
    HOLD_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_ENABLED: bool(true),

    REDIS_URL: z.string().optional().default(''),
    RESERVATION_STORE: z.enum(['mongo', 'redis']).default('mongo'),
    QUEUE_DRIVER: z.enum(['inline', 'bullmq']).default('inline'),
    CACHE_DRIVER: z.enum(['none', 'memory', 'redis']).default('none'),
    RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
    REALTIME_ENABLED: bool(false),
    WAITING_ROOM_ENABLED: bool(false),
    WAITING_ROOM_MAX_ACTIVE: z.coerce.number().int().positive().default(200),
    WAITING_ROOM_ADMISSION_SECONDS: z.coerce.number().int().positive().default(600),
  })
  .superRefine((e, ctx) => {
    const needsRedis = [
      e.RESERVATION_STORE === 'redis' && 'RESERVATION_STORE=redis',
      e.QUEUE_DRIVER === 'bullmq' && 'QUEUE_DRIVER=bullmq',
      e.CACHE_DRIVER === 'redis' && 'CACHE_DRIVER=redis',
      e.RATE_LIMIT_STORE === 'redis' && 'RATE_LIMIT_STORE=redis',
      e.WAITING_ROOM_ENABLED && 'WAITING_ROOM_ENABLED=true',
    ].filter(Boolean);
    if (needsRedis.length && !e.REDIS_URL) {
      ctx.addIssue({ code: 'custom', message: `REDIS_URL is required for: ${needsRedis.join(', ')}` });
    }
    if (e.PAYMENT_PROVIDER === 'razorpay' && (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET)) {
      ctx.addIssue({ code: 'custom', message: 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER=razorpay' });
    }
    if (e.COOKIE_SAMESITE === 'none' && !e.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast: a misconfigured server should never start.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(` - ${issue.path.join('.') || 'env'}: ${issue.message}`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim()),
});
