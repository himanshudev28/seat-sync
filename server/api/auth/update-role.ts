import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { badRequest, handleApiError, notFound } from '../_utils/http.js';
import { bool, objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId: callerId } = await requireAdmin(req);
    await dbConnect();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = objectId(body.userId);
    const is_admin = bool(body.is_admin);

    if (userId === callerId) throw badRequest('You cannot change your own admin role');

    if (!is_admin) {
      const target = await User.findById(userId).select('is_admin').lean();
      if (target?.is_admin && (await User.countDocuments({ is_admin: true })) <= 1) {
        throw badRequest('Cannot demote the last admin');
      }
    }

    // Bump token_version so the target's sessions are revoked immediately.
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { is_admin }, $inc: { token_version: 1 } },
      { new: true }
    ).select('-password -token_version');
    if (!user) throw notFound('User not found');
    return res.status(200).json(user);
  } catch (err) {
    return handleApiError(res, err, '[api/auth/update-role]');
  }
}
