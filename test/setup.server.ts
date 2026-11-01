import { existsSync } from 'node:fs'

// Safety: a server test must never reach the live database. Whatever the shell exported is dropped;
// tests set MONGODB_URI to their in-memory server (see test/mongo.ts) before importing server code.
delete process.env.MONGODB_URI

// Use the locally installed mongod instead of downloading one (the network here is slow).
const systemMongod = ['/opt/homebrew/bin/mongod', '/usr/local/bin/mongod'].find((p) => existsSync(p))
if (systemMongod && !process.env.MONGOMS_SYSTEM_BINARY) {
  process.env.MONGOMS_SYSTEM_BINARY = systemMongod
  // The installed binary's version wins over mongodb-memory-server's default.
  process.env.MONGOMS_VERSION ??= '6.0.0'
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK ??= '0'
}

process.env.JWT_SECRET ??= 'test-only-jwt-secret-not-used-anywhere-else'
