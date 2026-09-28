import { afterAll, afterEach, beforeAll, inject } from 'vitest';

// Must be set before src/config/env.js is imported for the first time.
process.env.MONGODB_URI = inject('mongoUri');

const { default: mongoose } = await import('mongoose');
const { connectDb, disconnectDb } = await import('../src/infra/db/mongoose.js');

beforeAll(async () => {
  if (mongoose.connection.readyState !== 1) await connectDb(process.env.MONGODB_URI);
  // Unique / partial indexes are part of the business rules, so make sure they exist.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
});

afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDb();
});
