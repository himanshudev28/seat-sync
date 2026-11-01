import jwt from 'jsonwebtoken';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import User from '../../models/User.js';
import dbConnect from '../../db.js';
import { forbidden, unauthorized } from './http.js';

export const SESSION_COOKIE = 'ss_session';
const MAX_AGE_SEC = 86400;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

export interface AuthUser { userId: string; email: string; is_admin: boolean }

interface TokenPayload { userId: string; sub?: string; email: string; tv: number }

export function signToken(user: { _id?: unknown; id?: string; userId?: string; email: string; token_version?: number }): string {
  const id = user.userId ?? user.id ?? String(user._id);
  return jwt.sign({ sub: id, userId: id, email: user.email, tv: user.token_version ?? 0 }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: '1d',
  });
}

export function parseCookies(req: VercelRequest): Record<string, string> {
  const raw = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip */ }
  }
  return out;
}

export function getTokenFromRequest(req: VercelRequest): string | null {
  const c = parseCookies(req)[SESSION_COOKIE];
  if (c) return c;
  // TODO(auth-migration): remove the Bearer fallback once clients rely on the cookie only.
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function requireAuth(req: VercelRequest): Promise<AuthUser> {
  const token = getTokenFromRequest(req);
  if (!token) throw unauthorized();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as unknown as TokenPayload;
  } catch {
    throw unauthorized();
  }
  const id = payload.userId || payload.sub;
  if (!id || typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw unauthorized();
  await dbConnect();
  const user = await User.findById(id).select('is_admin token_version email').lean();
  if (!user || payload.tv !== (user.token_version ?? 0)) throw unauthorized();
  return { userId: String(user._id), email: user.email, is_admin: !!user.is_admin };
}

export async function requireAdmin(req: VercelRequest): Promise<AuthUser> {
  const u = await requireAuth(req);
  if (!u.is_admin) throw forbidden('Admin access required');
  return u;
}

function isLocalHost(req: VercelRequest): boolean {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function cookieAttrs(req: VercelRequest, maxAge: number, extra = ''): string {
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${isLocalHost(req) ? '' : '; Secure'}${extra}`;
}

/** Appends a Set-Cookie without clobbering ones already set on the response. */
export function appendCookie(res: VercelResponse, cookie: string): void {
  const prev = (res as any).getHeader?.('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function setSessionCookie(res: VercelResponse, token: string, req: VercelRequest): void {
  appendCookie(res, `${SESSION_COOKIE}=${token}; ${cookieAttrs(req, MAX_AGE_SEC)}`);
}

export function clearSessionCookie(res: VercelResponse, req: VercelRequest): void {
  appendCookie(res, `${SESSION_COOKIE}=; ${cookieAttrs(req, 0)}`);
}

export async function bumpTokenVersion(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { token_version: 1 } });
}
