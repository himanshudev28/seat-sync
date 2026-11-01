import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import Booking from '../../models/Booking.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';
import { clampInt } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    await dbConnect();

    const { page = '1', limit = '50' } = req.query;
    const pageNum = clampInt(page, 1, 1, 100000);
    const limitNum = clampInt(limit, 50, 1, 100);
    const skip = (pageNum - 1) * limitNum;

    const [users, bookingCounts, total] = await Promise.all([
      User.find({}).select('-password -token_version').sort({ created_at: -1, _id: 1 }).skip(skip).limit(limitNum).lean(),
      Booking.aggregate([
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ]),
      User.countDocuments({}),
    ]);

    const countMap = new Map((bookingCounts as Array<{ _id: unknown; count: number }>).map((b) => [String(b._id), b.count]));

    // Normalise _id → id and attach booking_count
    const normalized = users.map((u) => ({
      ...u,
      id: String((u as any)._id),
      booking_count: countMap.get(String((u as any)._id)) ?? 0,
    }));

    return res.status(200).json({
      data: normalized,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    return handleApiError(res, err, '[api/auth/users]');
  }
}
