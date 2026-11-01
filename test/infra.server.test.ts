import { startTestMongo } from './mongo'

describe('server test infrastructure', () => {
  it('never inherits a database URI from the shell or .env', () => {
    expect(process.env.MONGODB_URI).toBeUndefined()
  })

  it('starts a local in-memory MongoDB and cleans up', async () => {
    const stop = await startTestMongo()
    expect(process.env.MONGODB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+\/seatsync_test/)
    expect(process.env.MONGODB_URI).toContain('replicaSet=')
    const mongoose = (await import('mongoose')).default
    await mongoose.connect(process.env.MONGODB_URI!)
    await mongoose.connection.db!.collection('smoke').insertOne({ ok: 1 })
    expect(await mongoose.connection.db!.collection('smoke').countDocuments()).toBe(1)
    // Transactions need a replica set: this is what the booking handler relies on.
    const session = await mongoose.startSession()
    await session.withTransaction(async () => {
      await mongoose.connection.db!.collection('smoke').insertOne({ ok: 2 }, { session })
    })
    await session.endSession()
    expect(await mongoose.connection.db!.collection('smoke').countDocuments()).toBe(2)
    await stop()
    expect(process.env.MONGODB_URI).toBeUndefined()
  })
})
