import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import Booking from '../../models/Booking.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { csvCell } from '../_utils/validate.js';
import { handleApiError } from '../_utils/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    await dbConnect();

    const [users, bookingCounts] = await Promise.all([
      User.find({}).select('first_name last_name email phone_number student_id course is_admin created_at').sort({ created_at: 1, _id: 1 }).limit(10_000).lean(),
      Booking.aggregate([
        { $match: { status: { $in: ['confirmed', 'pending'] } } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(bookingCounts.map((b: any) => [String(b._id), b.count]));

    const header = [
      'User ID', 'First Name', 'Last Name', 'Email', 'Phone',
      'Student ID', 'Course', 'Role', 'Total Bookings', 'Registered Date',
    ];

    const dataRows = users.map((u) => [
      String(u._id),
      u.first_name || '',
      u.last_name || '',
      u.email,
      (u as any).phone_number || '',
      (u as any).student_id || '',
      (u as any).course || '',
      u.is_admin ? 'Admin' : 'User',
      countMap.get(String(u._id)) ?? 0,
      new Date((u as any).created_at || Date.now()).toLocaleString(),
    ]);

    const csv = [header, ...dataRows].map((row) => row.map(csvCell).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    return handleApiError(res, err, '[api/admin/export-users]');
  }
}
