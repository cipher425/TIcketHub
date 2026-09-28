import { MongoMemoryReplSet } from 'mongodb-memory-server';

// A real single-node REPLICA SET, because the booking flow uses multi-document transactions.
export default async function setup({ provide }) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  provide('mongoUri', replSet.getUri('tickethub-test'));
  return async () => replSet.stop();
}
