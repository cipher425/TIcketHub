import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false, // all files share one in-memory replica set
    testTimeout: 30_000,
    hookTimeout: 180_000, // first run downloads a MongoDB binary
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://set-by-setup',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
      ADMISSION_TOKEN_SECRET: 'test-admission-secret-test-admission-000',
      BCRYPT_ROUNDS: '4',
      PAYMENT_PROVIDER: 'mock',
      RATE_LIMIT_ENABLED: 'false',
      RUN_JOBS: 'false',
    },
  },
});
