import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Seat from '../../models/Seat.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    const eventId = objectId((req.body ?? {}).eventId);
    await dbConnect();

    const session = await mongoose.startSession();
    try {
      let seatsReset = 0;
      await session.withTransaction(async () => {
        // Every booking for the event goes (confirmed and pending), with its seat links.
        const active = await Booking.find({ event_id: eventId, status: { $in: ['confirmed', 'pending'] } })
          .select('_id').session(session).lean();
        const ids = active.map((b) => b._id);
        if (ids.length) {
          await BookingSeat.deleteMany({ booking_id: { $in: ids } }, { session });
          await Booking.updateMany({ _id: { $in: ids } }, { $set: { status: 'cancelled' } }, { session });
        }
        // Free booked seats and clear holds; blocked seats stay blocked.
        const r = await Seat.updateMany(
          { event_id: eventId, seat_type: { $ne: 'blocked' }, status: { $in: ['booked', 'reserved'] } },
          { $set: { status: 'available', heldBy: null, heldUntil: null, heldSince: null } },
          { session }
        );
        seatsReset = r.modifiedCount;
      });
      return res.status(200).json({ message: 'All seats reset to available', seatsReset });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    return handleApiError(res, err, '[api/seats/reset]');
  }
}
