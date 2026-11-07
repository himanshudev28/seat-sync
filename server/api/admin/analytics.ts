import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Seat from '../../models/Seat.js';
import Booking from '../../models/Booking.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();

  try {
    await requireAdmin(req);
    const eventId = objectId(req.query.eventId);

    const eventObjId = new mongoose.Types.ObjectId(eventId);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    // All counts computed in MongoDB — nothing loaded into Node.js heap
    const [seatStats, bookingStats, trendRaw, topUsersRaw] = await Promise.all([
      // Seat counts grouped by status/type in one pass
      Seat.aggregate([
        { $match: { event_id: eventObjId } },
        { $group: {
          _id: null,
          total:     { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          booked:    { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } },
          reserved:  { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, 1, 0] } },
          vip:       { $sum: { $cond: [{ $eq: ['$seat_type', 'vip'] }, 1, 0] } },
          wheelchair: { $sum: { $cond: [{ $eq: ['$seat_type', 'wheelchair'] }, 1, 0] } },
          blocked:   { $sum: { $cond: [{ $eq: ['$seat_type', 'blocked'] }, 1, 0] } },
        }},
      ]),
      // Booking totals: confirmed/cancelled, revenue, checked-in
      Booking.aggregate([
        { $match: { event_id: eventObjId } },
        { $group: {
          _id: null,
          total:      { $sum: 1 },
          confirmed:  { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          cancelled:  { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          revenue:    { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$total_price', 0] } },
          checked_in: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, '$checked_in'] }, 1, 0] } },
        }},
      ]),
      // Booking trend: last 14 days, confirmed + pending (same as the stats trend)
      Booking.aggregate([
        { $match: { event_id: eventObjId, status: { $in: ['confirmed', 'pending'] }, created_at: { $gte: fourteenDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      // Top 5 users by booking count for this event
      Booking.aggregate([
        { $match: { event_id: eventObjId, status: 'confirmed' } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
          pipeline: [{ $project: { first_name: 1, last_name: 1, email: 1, student_id: 1, course: 1 } }],
        }},
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      ]),
    ]);

    const s = seatStats[0] ?? { total: 0, available: 0, booked: 0, reserved: 0, vip: 0, wheelchair: 0, blocked: 0 };
    const b = bookingStats[0] ?? { total: 0, confirmed: 0, cancelled: 0, revenue: 0, checked_in: 0 };

    // Build trend array for last 14 days, filling zeros for missing days
    const trendMap = new Map((trendRaw as { _id: string; count: number }[]).map((r) => [r._id, r.count]));
    const now = Date.now();
    const trend = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(now - (13 - i) * 86400000);
      // Same UTC YYYY-MM-DD as the $dateToString key above, or the lookup misses.
      const key = day.toISOString().slice(0, 10);
      return { date: `${day.getUTCMonth() + 1}/${day.getUTCDate()}`, count: trendMap.get(key) ?? 0 };
    });

    const most_active_users = (topUsersRaw as { _id: unknown; count: number; user?: { first_name?: string; last_name?: string; email?: string; student_id?: string; course?: string } }[]).map((r) => ({
      name: [r.user?.first_name, r.user?.last_name].filter(Boolean).join(' ') || r.user?.email || 'Unknown',
      email: r.user?.email ?? '',
      student_id: r.user?.student_id ?? null,
      course: r.user?.course ?? null,
      bookings: r.count,
    }));

    // Blocked seats can't be sold, so they don't count toward capacity.
    const sellable = s.total - s.blocked;
    const occupancy_pct = sellable > 0 ? Math.round((s.booked / sellable) * 100) : 0;

    return res.status(200).json({
      total_seats: s.total,
      available_seats: s.available,
      booked_seats: s.booked,
      reserved_seats: s.reserved,
      vip_seats: s.vip,
      wheelchair_seats: s.wheelchair ?? 0,
      blocked_seats: s.blocked,
      total_bookings: b.total,
      confirmed_bookings: b.confirmed,
      cancelled_bookings: b.cancelled,
      revenue: b.revenue,
      checked_in: b.checked_in,
      occupancy_pct,
      booking_trend: trend,
      most_active_users,
    });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/analytics]');
  }
}
