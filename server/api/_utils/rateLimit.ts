import { createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import dbConnect from '../../db.js';
import RateLimit from '../../models/RateLimit.js';
import { tooMany } from './http.js';

/**
 * MongoDB-backed limiter (collection `ratelimits`, shared across serverless instances).
 * Tradeoff: it FAILS OPEN on DB errors (logged once) so a Mongo hiccup cannot lock everyone out.
 * NOTE: rateLimit and the lockout helpers are ASYNC: always `await` them.
 */

let warned = false;
function failOpen(err: unknown) {
  if (!warned) { warned = true; console.error('[rateLimit] store error, failing open:', err); }
}

/** Atomic increment inside a fixed window. Returns the new count and ms until reset. */
async function hit(key: string, windowMs: number): Promise<{ count: number; resetInMs: number }> {
  await dbConnect();
  const now = new Date();
  const next = new Date(now.getTime() + windowMs);
  const live = { $and: [{ $gt: [{ $ifNull: ['$resetAt', new Date(0)] }, now] }] };
  const update = [{
    $set: {
      count: { $cond: [live, { $add: [{ $ifNull: ['$count', 0] }, 1] }, 1] },
      resetAt: { $cond: [live, '$resetAt', next] },
    },
  }];
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await RateLimit.findOneAndUpdate({ _id: key }, update as any, { upsert: true, returnDocument: 'after', updatePipeline: true }).lean();
      return { count: doc!.count, resetInMs: Math.max(0, doc!.resetAt.getTime() - now.getTime()) };
    } catch (e: any) {
      if (e?.code === 11000 && attempt < 3) continue; // concurrent first-upsert race: retry
      throw e;
    }
  }
}

/** Trusted-proxy aware: never the client-supplied first X-Forwarded-For entry. */
const h = (req: VercelRequest, n: string): string | undefined => {
  const v = req.headers[n];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
};

export function getClientIp(req: VercelRequest): string {
  const v = h(req, 'x-vercel-forwarded-for');
  if (v) return v.split(',')[0].trim();
  const r = h(req, 'x-real-ip');
  if (r) return r;
  const x = h(req, 'x-forwarded-for');
  if (x) {
    const parts = x.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return (req as any).socket?.remoteAddress ?? 'unknown';
}
export const getIp = getClientIp;

export async function rateLimit(
  req: VercelRequest,
  opts: { bucket: string; limit: number; windowMs: number; key?: string }
): Promise<void> {
  let r: { count: number; resetInMs: number };
  try {
    r = await hit(`${opts.bucket}:${opts.key ?? 'ip:' + getClientIp(req)}`, opts.windowMs);
  } catch (e) { failOpen(e); return; }
  if (r.count > opts.limit) throw tooMany(r.resetInMs / 1000);
}

// Per-account login lockout: 5 failures in 15 minutes locks the account for 15 minutes.
const LOCK_MS = 15 * 60_000;
const LOCK_AFTER = 5;
const akey = (email: string) =>
  'login:acct:' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

export async function noteLoginFailure(email: string): Promise<void> {
  try {
    const key = akey(email);
    const { count } = await hit(key, LOCK_MS);
    if (count >= LOCK_AFTER) {
      const until = new Date(Date.now() + LOCK_MS);
      await RateLimit.updateOne({ _id: key }, { $set: { lockedUntil: until, resetAt: until } });
    }
  } catch (e) { failOpen(e); }
}

export async function isLockedOut(email: string): Promise<boolean> {
  try {
    await dbConnect();
    const d = await RateLimit.findById(akey(email)).lean();
    return !!d?.lockedUntil && d.lockedUntil.getTime() > Date.now();
  } catch (e) { failOpen(e); return false; }
}

export async function clearLoginFailures(email: string): Promise<void> {
  try { await dbConnect(); await RateLimit.deleteOne({ _id: akey(email) }); } catch (e) { failOpen(e); }
}
