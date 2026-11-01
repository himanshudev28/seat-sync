import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAuth } from '../_utils/auth.js';
import { handleApiError, notFound } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { httpsUrl, str } from '../_utils/validate.js';

const LIMITS: Record<string, number> = { first_name: 100, last_name: 100, student_id: 50, course: 100, phone_number: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = await requireAuth(req);
    await rateLimit(req, { bucket: 'update-profile', limit: 30, windowMs: 10 * 60_000, key: `user:${userId}` });
    await dbConnect();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const [k, max] of Object.entries(LIMITS)) {
      if (body[k] !== undefined) update[k] = str(body[k], { max });
    }
    if (body.avatar_url !== undefined) {
      update.avatar_url = body.avatar_url === null || body.avatar_url === '' ? null : httpsUrl(body.avatar_url, { max: 2048 });
    }

    const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true }).select('-password -token_version');
    if (!user) throw notFound('User not found');
    return res.status(200).json(user);
  } catch (err) {
    return handleApiError(res, err, '[api/auth/update-profile]');
  }
}
