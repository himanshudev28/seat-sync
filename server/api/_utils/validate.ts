import { Types } from 'mongoose';
import { badRequest } from './http.js';

export function str(v: unknown, opts: { min?: number; max: number; trim?: boolean }): string {
  if (typeof v !== 'string') throw badRequest('Invalid input');
  const s = opts.trim === false ? v : v.trim();
  if (s.length < (opts.min ?? 0)) throw badRequest('Input too short');
  if (s.length > opts.max) throw badRequest('Input too long');
  return s;
}

export function email(v: unknown): string {
  if (typeof v !== 'string') throw badRequest('Invalid email');
  const s = v.trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest('Invalid email');
  return s;
}

export function password(v: unknown): string {
  if (typeof v !== 'string') throw badRequest('Invalid password');
  if (v.length < 10 || v.length > 72) throw badRequest('Password must be 10 to 72 characters');
  return v;
}

export function objectId(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-f\d]{24}$/i.test(v) || !Types.ObjectId.isValid(v)) {
    throw badRequest('Invalid id');
  }
  return v;
}

/**
 * A non-empty list of unique ObjectIds. `noun` makes the 400 message say what went wrong in the
 * user's words, e.g. "You can select at most 10 seats at a time".
 */
export function objectIdArray(v: unknown, opts: { max: number; noun?: string }): string[] {
  const noun = opts.noun ?? 'items';
  const one = noun.replace(/s$/, '');
  if (!Array.isArray(v) || v.length === 0) throw badRequest(`Select at least one ${one}`);
  if (v.length > opts.max) throw badRequest(`You can select at most ${opts.max} ${noun} at a time`);
  const ids = v.map((x) => {
    try {
      return objectId(x);
    } catch {
      throw badRequest(`Invalid ${one} id`);
    }
  });
  if (new Set(ids).size !== ids.length) throw badRequest(`The same ${one} was selected twice`);
  return ids;
}

export function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw badRequest('Expected a boolean');
  return v;
}

export function clampInt(v: unknown, def: number, min: number, max: number): number {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function safeFilename(s: string): string {
  const out = String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 100);
  return out || 'file';
}

export function httpsUrl(v: unknown, opts: { max: number }): string {
  if (typeof v !== 'string' || v.length > opts.max) throw badRequest('Invalid URL');
  let u: URL;
  try { u = new URL(v); } catch { throw badRequest('Invalid URL'); }
  if (u.protocol !== 'https:') throw badRequest('URL must use https');
  return u.toString();
}
