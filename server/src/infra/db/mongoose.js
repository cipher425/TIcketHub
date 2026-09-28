import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 10_000,
    autoIndex: !env.isProd,
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/**
 * Runs `fn(session)` inside a MongoDB transaction.
 * Mongoose retries automatically on TransientTransactionError (e.g. write conflicts),
 * so `fn` must be safe to run more than once.
 */
export function withTransaction(fn) {
  return mongoose.connection.transaction((session) => fn(session));
}
