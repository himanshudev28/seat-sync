import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAuth, signToken, setSessionCookie } from '../_utils/auth.js';
import { badRequest, handleApiError, notFound } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { password as vPassword } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = await requireAuth(req);
    await rateLimit(req, { bucket: 'change-password', limit: 5, windowMs: 15 * 60_000, key: `user:${userId}` });
    await dbConnect();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = body.currentPassword;
    if (typeof current !== 'string' || !current || current.length > 72) throw badRequest('currentPassword is required');
    const newPassword = vPassword(body.newPassword);

    const user = await User.findById(userId).select('+password');
    if (!user) throw notFound('User not found');
    if (!user.password) throw badRequest('Set a password via reset');

    if (!(await bcrypt.compare(current, user.password))) throw badRequest('Current password is incorrect');

    user.password = newPassword;
    user.token_version = (user.token_version ?? 0) + 1; // revoke all other sessions
    await user.save();

    // Keep THIS session alive with a fresh token.
    const token = signToken(user);
    setSessionCookie(res, token, req);
    // TODO(auth-migration): drop `token` once clients use the cookie only.
    return res.status(200).json({ message: 'Password changed successfully', token });
  } catch (err) {
    return handleApiError(res, err, '[api/auth/change-password]');
  }
}
