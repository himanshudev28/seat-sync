import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import Event from '../../models/Event.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';

// Pre-aggregated dashboard stats. The Admin overview previously derived
// counters from the paginated `/api/bookings/admin?page=1` response, which
// silently showed wrong totals on any platform with >50 bookings. This
// endpoint hits the DB with grouped queries so the dashboard always reflects
// the true state, regardless of pagination.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();

  try {
    await requireAdmin(req);

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalEvents,
      publishedEvents,
      totalUsers,
      adminUsers,
      newUsersThisMonth,
      bookingStatusBreakdown,
      revenueByEvent,
      bookingTrend,
      categoryBreakdown,
    ] = await Promise.all([
      Event.countDocuments({}),
      Event.countDocuments({ is_published: true }),
      User.countDocuments({}),
      User.countDocuments({ is_admin: true }),
      User.countDocuments({ created_at: { $gte: since30 } }),
      Booking.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$total_price' } } },
      ]),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: '$event_id', revenue: { $sum: '$total_price' } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: '_id',
            as: 'event',
          },
        },
        {
          $project: {
            _id: 0,
            title: { $arrayElemAt: ['$event.title', 0] },
            revenue: 1,
          },
        },
      ]),
      Booking.aggregate([
        { $match: { status: { $in: ['confirmed', 'pending'] }, created_at: { $gte: since30 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Event.aggregate([
        { $group: { _id: { $ifNull: ['$category', 'Uncategorized'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Flatten booking status / revenue into convenient totals
    const statusMap = new Map<string, { count: number; revenue: number }>();
    for (const row of bookingStatusBreakdown as Array<{ _id: string; count: number; revenue: number }>) {
      statusMap.set(row._id, { count: row.count, revenue: row.revenue });
    }
    const confirmed = statusMap.get('confirmed') ?? { count: 0, revenue: 0 };
    const cancelled = statusMap.get('cancelled') ?? { count: 0, revenue: 0 };
    const pending = statusMap.get('pending') ?? { count: 0, revenue: 0 };
    const refunded = statusMap.get('refunded') ?? { count: 0, revenue: 0 };
    const totalBookings = confirmed.count + cancelled.count + pending.count + refunded.count;

    return res.status(200).json({
      events: { total: totalEvents, published: publishedEvents, drafts: totalEvents - publishedEvents },
      users: { total: totalUsers, admins: adminUsers, newThisMonth: newUsersThisMonth },
      bookings: {
        total: totalBookings,
        confirmed: confirmed.count,
        cancelled: cancelled.count,
        pending: pending.count,
        refunded: refunded.count,
        revenue: confirmed.revenue,
      },
      bookingTrend: (bookingTrend as Array<{ _id: string; count: number }>).map((r) => ({
        date: r._id,
        count: r.count,
      })),
      revenueByEvent: revenueByEvent as Array<{ title: string; revenue: number }>,
      categoryBreakdown: (categoryBreakdown as Array<{ _id: string; count: number }>).map((c) => ({
        category: c._id,
        count: c.count,
      })),
    });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/stats]');
  }
}
