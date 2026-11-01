import type { VercelRequest, VercelResponse } from '@vercel/node';
import { forbidden } from './http.js';

const DEV_ORIGINS = ['http://localhost:5274', 'http://localhost:8080'];

const isProd = () => process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

/** ALLOWED_ORIGIN is a comma-separated allowlist. Unset in production = fail closed (no CORS). */
export function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGIN;
  if (raw && raw.trim()) {
    return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter((s) => s && s !== '*');
  }
  return isProd() ? [] : DEV_ORIGINS;
}

const header = (req: VercelRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

export function setCorsHeaders(res: VercelResponse, req?: VercelRequest): void {
  res.setHeader('Vary', 'Origin');
  const origin = req ? header(req, 'origin') : undefined;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

/**
 * CSRF guard for cookie-authenticated mutating requests: Origin (or Referer) must be
 * allow-listed or the request's own host.
 */
export function assertSameOrigin(req: VercelRequest): void {
  const m = (req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return;
  let origin = header(req, 'origin');
  if (!origin) {
    const ref = header(req, 'referer');
    if (ref) { try { origin = new URL(ref).origin; } catch { /* ignore */ } }
  }
  if (!origin) throw forbidden('Cross-origin request blocked');
  if (allowedOrigins().includes(origin)) return;
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  try {
    if (host && new URL(origin).host === host) return;
  } catch { /* fallthrough */ }
  throw forbidden('Cross-origin request blocked');
}

export function setPublicCache(res: VercelResponse, maxAgeSeconds = 60): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds * 2}, stale-while-revalidate=300`
  );
}

/** Private responses (auth, user-specific data) must never be cached by CDN. */
export function setNoCache(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}
