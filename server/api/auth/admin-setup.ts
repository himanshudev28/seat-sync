import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import RateLimit from '../../models/RateLimit.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { badRequest, forbidden, handleApiError, notFound, HttpError } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { email as vEmail, password as vPassword, str } from '../_utils/validate.js';

function tokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOCK_ID = 'admin-setup-lock';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const expected = process.env.ADMIN_SETUP_TOKEN;
    if (!expected) throw notFound('Not found'); // disabled unless configured
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    await rateLimit(req, { bucket: 'admin-setup', limit: 5, windowMs: 15 * 60_000 });
    if (!tokenMatches(req.headers['x-admin-setup-token'], expected)) throw forbidden();

    await dbConnect();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = vEmail(body.email);
    const password = vPassword(body.password);
    const first_name = body.first_name === undefined ? 'Admin' : str(body.first_name, { max: 100 });
    const last_name = body.last_name === undefined ? 'User' : str(body.last_name, { max: 100 });

    if (await User.exists({ is_admin: true })) throw badRequest('Admin user already exists');

    // Atomic guard: only one concurrent caller can hold the lock (duplicate _id fails).
    try {
      await RateLimit.create({ _id: LOCK_ID, count: 1, resetAt: new Date(Date.now() + 60_000) });
    } catch (e: any) {
      if (e?.code === 11000) throw new HttpError(409, 'Setup already in progress');
      throw e;
    }
    try {
      // Re-check under the lock so a caller that passed the first check before a winner finished can't create a second admin.
      if (await User.exists({ is_admin: true })) throw badRequest('Admin user already exists');
      if (await User.exists({ email })) throw badRequest('Unable to create admin with these details');
      const admin = await User.create({ email, password, first_name, last_name, is_admin: true });
      return res.status(201).json({
        success: true,
        message: 'Admin user created successfully',
        user: { id: String(admin._id), email: admin.email, first_name: admin.first_name, last_name: admin.last_name, is_admin: true },
      });
    } finally {
      await RateLimit.deleteOne({ _id: LOCK_ID }).catch(() => {});
    }
  } catch (err) {
    return handleApiError(res, err, '[api/auth/admin-setup]');
  }
}
