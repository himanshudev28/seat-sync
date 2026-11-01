import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'

// Deliberately NOT built on vite.config.ts: that file copies .env (live Atlas MONGODB_URI)
// into process.env. Tests must never see it — server tests get an in-memory Mongo instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          globals: true,
          css: false,
          include: ['src/**/*.test.{ts,tsx}', 'test/**/*.web.test.{ts,tsx}'],
          setupFiles: ['./test/setup.web.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['server/**/*.test.ts', 'api/**/*.test.ts', 'test/**/*.server.test.ts'],
          setupFiles: ['./test/setup.server.ts'],
          // One in-memory mongod per file is plenty; keep files from fighting over ports.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
