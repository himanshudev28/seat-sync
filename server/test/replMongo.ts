import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Like test/mongo.ts but a single-node replica set, because bookings/cancel/reset use
 * transactions and a standalone mongod rejects them. Local in-memory only.
 */
export async function startTestReplMongo(): Promise<() => Promise<void>> {
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = server.getUri('seatsync_test');
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
    await server.stop();
    throw new Error('Refusing a non-local test database');
  }
  process.env.MONGODB_URI = uri;
  return async () => {
    const mongoose = (await import('mongoose')).default;
    await mongoose.disconnect().catch(() => {});
    await server.stop();
    delete process.env.MONGODB_URI;
  };
}
