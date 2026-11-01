/**
 * Deploy safety: a missing ALLOWED_ORIGIN or APP_URL on Vercel must not lock the live site out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest } from '@vercel/node'

const req = (headers: Record<string, string>, method = 'POST') =>
  ({ method, headers } as unknown as VercelRequest)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('deploy defaults', () => {
  it('same-origin mutations work on Vercel with ALLOWED_ORIGIN unset', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('ALLOWED_ORIGIN', '')
    const { assertSameOrigin, allowedOrigins } = await import('../../_utils/cors.js')
    expect(allowedOrigins()).toEqual([])
    expect(() =>
      assertSameOrigin(req({ origin: 'https://seat-sync-five.vercel.app', host: 'seat-sync-five.vercel.app' })),
    ).not.toThrow()
    expect(() =>
      assertSameOrigin(req({ origin: 'https://evil.example', host: 'seat-sync-five.vercel.app' })),
    ).toThrow()
  })

  it('APP_URL falls back to the Vercel production domain, never the request Host', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('APP_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'seat-sync-five.vercel.app')
    const { getAppUrl } = await import('../google/index.js')
    expect(getAppUrl()).toBe('https://seat-sync-five.vercel.app')
  })

  it('an explicit APP_URL still wins', async () => {
    vi.stubEnv('APP_URL', 'https://tickets.example.com/')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'seat-sync-five.vercel.app')
    const { getAppUrl } = await import('../google/index.js')
    expect(getAppUrl()).toBe('https://tickets.example.com')
  })
})
