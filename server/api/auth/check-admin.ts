import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { handleApiError, notFound } from '../_utils/http.js';
import { requireAdmin } from '../_utils/auth.js';

// No longer public: 404 when setup is disabled, otherwise admin-only.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!process.env.ADMIN_SETUP_TOKEN) throw notFound();
    await requireAdmin(req);
    await dbConnect();
    const admin = await User.findOne({ is_admin: true }).select('_id').lean();
    return res.status(200).json({ adminExists: admin !== null });
  } catch (err) {
    return handleApiError(res, err, '[api/auth/check-admin]');
  }
}
