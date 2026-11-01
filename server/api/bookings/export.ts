import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Event from '../../models/Event.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { csvCell, objectId, safeFilename } from '../_utils/validate.js';
import { handleApiError, notFound } from '../_utils/http.js';

function toCSV(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    const eventId = objectId(req.query.eventId);
    await dbConnect();

    const event = await Event.findById(eventId).lean() as { title: string } | null;
    if (!event) throw notFound('Event not found');

    const bookings = await Booking.find({ event_id: eventId })
      .select('user_id total_price status checked_in checked_in_at booking_note created_at')
      .sort({ created_at: 1, _id: 1 })
      .limit(5_000)
      .lean() as Array<{
      _id: unknown;
      user_id: unknown;
      total_price: number;
      status: string;
      created_at: Date;
    }>;

    // Batch-load all users in one query
    const userIds = [...new Set(bookings.map((b) => String(b.user_id)))];
    const users = await User.find({ _id: { $in: userIds } }).lean() as Array<{
      _id: unknown;
      first_name: string | null;
      last_name: string | null;
      email: string;
      phone_number?: string | null;
      student_id?: string | null;
      course?: string | null;
    }>;
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Batch-load all booking_seats + seats
    const bookingIds = bookings.map((b) => b._id) as string[];
    const bookingSeats = await BookingSeat.find({ booking_id: { $in: bookingIds } })
      .populate('seat_id')
      .lean() as unknown as Array<{ booking_id: unknown; seat_id: { row: string; number: number } | null }>;

    const seatsByBooking = new Map<string, string[]>();
    for (const bs of bookingSeats) {
      const key = String(bs.booking_id);
      if (!seatsByBooking.has(key)) seatsByBooking.set(key, []);
      if (bs.seat_id) {
        seatsByBooking.get(key)!.push(`${bs.seat_id.row}${bs.seat_id.number}`);
      }
    }

    const header = [
      'Booking ID', 'QR / Ticket ID', 'Event', 'User Name', 'Student ID',
      'Email', 'Phone', 'Course', 'Seats', 'Ticket Type', 'Status',
      'Checked In', 'Amount (INR)', 'Booking Date', 'Note',
    ];
    const dataRows = bookings.map((b) => {
      const user = userMap.get(String(b.user_id));
      const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Unknown';
      return [
        b._id,
        String(b._id), // QR / Ticket ID (same as booking ID for scanning)
        event.title,
        userName,
        user?.student_id ?? '',
        user?.email ?? '',
        user?.phone_number ?? '',
        user?.course ?? '',
        (seatsByBooking.get(String(b._id)) ?? []).join(', ') || 'None',
        'Standard',
        b.status,
        (b as any).checked_in ? 'Yes' : 'No',
        b.total_price.toFixed(2),
        new Date(b.created_at).toLocaleString(),
        (b as any).booking_note ?? '',
      ];
    });

    const csv = toCSV([header, ...dataRows]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(event.title)}-bookings.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return handleApiError(res, err, '[api/bookings/export]');
  }
}
