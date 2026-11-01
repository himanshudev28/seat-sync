import { MongoMemoryReplSet } from 'mongodb-memory-server'

/**
 * Starts a throwaway in-memory MongoDB (a one-node replica set: bookings use transactions,
 * which a standalone mongod rejects) and points MONGODB_URI at it. Call from beforeAll, then
 * import the server code; call the returned stop() from afterAll.
 *
 *   let stop: () => Promise<void>
 *   beforeAll(async () => { stop = await startTestMongo() })
 *   afterAll(() => stop())
 */
export async function startTestMongo(): Promise<() => Promise<void>> {
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  const uri = server.getUri('seatsync_test')
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
    await server.stop()
    throw new Error(`Refusing a non-local test database: ${uri.split('@').pop()}`)
  }
  process.env.MONGODB_URI = uri
  return async () => {
    const mongoose = (await import('mongoose')).default
    await mongoose.disconnect().catch(() => {})
    await server.stop()
    delete process.env.MONGODB_URI
  }
}
