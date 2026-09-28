// Stage 3 (only after measuring!): run several API processes + one worker with PM2.
//   npm i -g pm2 && pm2 start ecosystem.config.cjs
// Requires Redis-backed state (holds, rate limits, jobs, realtime fan-out) because
// in-memory state is NOT shared between processes.
module.exports = {
  apps: [
    {
      name: 'tickethub-api',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        RESERVATION_STORE: 'redis',
        QUEUE_DRIVER: 'bullmq',
        CACHE_DRIVER: 'redis',
        RATE_LIMIT_STORE: 'redis',
        REALTIME_ENABLED: 'true',
      },
    },
    {
      name: 'tickethub-worker',
      script: 'src/worker.js',
      instances: 1,
      env: { NODE_ENV: 'production', QUEUE_DRIVER: 'bullmq', RESERVATION_STORE: 'redis', REALTIME_ENABLED: 'true' },
    },
  ],
};
