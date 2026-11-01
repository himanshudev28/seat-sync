import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAuth } from '../_utils/auth.js';
import { handleApiError, notFound } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = await requireAuth(req);
    const id = objectId(req.query.id);
    await dbConnect();

    // Scoped to the authenticated user so users cannot access each other's bookings
    const booking = (await Booking.findOne({ _id: id, user_id: userId })
      .populate('event_id')
      .lean()) as unknown as Record<string, unknown> | null;
    if (!booking) throw notFound('Booking not found');

    const bookingSeats = await BookingSeat.find({ booking_id: id }).populate('seat_id').lean();

    return res.status(200).json({
      ...booking,
      event: booking.event_id,
      booking_seats: bookingSeats.map((bs) => ({ seat: bs.seat_id })),
    });
  } catch (err) {
    return handleApiError(res, err, '[api/bookings/[id]]');
  }
}
