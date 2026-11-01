import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAuth } from '../_utils/auth.js';
import { badRequest, handleApiError, notFound } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = await requireAuth(req);
    const bookingId = objectId((req.body ?? {}).bookingId);
    await dbConnect();

    const existing = await Booking.findOne({ _id: bookingId, user_id: userId }).lean();
    if (!existing) throw notFound('Booking not found');
    if (existing.status === 'cancelled') throw badRequest('Booking is already cancelled');
    if (existing.status !== 'confirmed') throw badRequest('Only confirmed bookings can be cancelled');

    // 24-hour cancellation policy
    const event = await Event.findById(existing.event_id).select('date').lean();
    if (event) {
      const hoursUntilEvent = (new Date((event as { date: Date }).date).getTime() - Date.now()) / 36e5;
      if (hoursUntilEvent < 24) throw badRequest('Cannot cancel within 24 hours of event');
    }

    const session = await mongoose.startSession();
    try {
      let cancelled: unknown = null;
      await session.withTransaction(async () => {
        // Atomic claim: only a confirmed booking of this user flips, so a concurrent double
        // cancel releases the seats once.
        cancelled = await Booking.findOneAndUpdate(
          { _id: bookingId, user_id: userId, status: 'confirmed' },
          { $set: { status: 'cancelled' } },
          { new: true, session }
        ).lean();
        if (!cancelled) return;

        const links = await BookingSeat.find({ booking_id: bookingId }).select('seat_id').session(session).lean();
        const seatIds = links.map((l) => l.seat_id);
        // Drop the links, otherwise the unique index on seat_id blocks the next sale of the seat.
        await BookingSeat.deleteMany({ booking_id: bookingId }, { session });
        if (seatIds.length) {
          await Seat.updateMany(
            { _id: { $in: seatIds }, status: 'booked' },
            { $set: { status: 'available', heldBy: null, heldUntil: null, heldSince: null } },
            { session }
          );
        }
      });
      if (!cancelled) throw badRequest('Booking is already cancelled');
      return res.status(200).json({ message: 'Booking cancelled', booking: cancelled });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    return handleApiError(res, err, '[api/bookings/cancel]');
  }
}
