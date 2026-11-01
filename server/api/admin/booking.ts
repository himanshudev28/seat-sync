import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import User from '../../models/User.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { email as validEmail, objectId, objectIdArray, str } from '../_utils/validate.js';
import { HttpError, handleApiError, notFound } from '../_utils/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId: adminId } = await requireAdmin(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventId = objectId(body.eventId);
    const seatIds = objectIdArray(body.seatIds, { max: 50 });
    const note = body.booking_note === undefined ? 'Admin booking' : str(body.booking_note, { max: 500 });
    // totalPrice from the client is ignored on purpose: the price is the sum of the seats.
    await dbConnect();

    let bookForUserId = adminId;
    if (body.targetUserEmail !== undefined && body.targetUserEmail !== '') {
      const targetUser = await User.findOne({ email: validEmail(body.targetUserEmail) }).select('_id').lean();
      if (!targetUser) throw notFound('No user found with that email');
      bookForUserId = String(targetUser._id);
    }
    if (!(await Event.exists({ _id: eventId }))) throw notFound('Event not found');

    const session = await mongoose.startSession();
    try {
      let bookingId: unknown = null;
      await session.withTransaction(async () => {
        const now = new Date();
        const seats = await Seat.find({ _id: { $in: seatIds }, event_id: eventId }).session(session);
        if (seats.length !== seatIds.length) throw new HttpError(400, 'One or more seats do not belong to this event');
        for (const s of seats) {
          if (s.seat_type === 'blocked') throw new HttpError(409, 'One or more seats are blocked');
          if (s.status === 'booked') throw new HttpError(409, 'One or more seats are already booked');
          if (s.status === 'reserved' && s.heldBy && s.heldBy !== bookForUserId && s.heldUntil && s.heldUntil > now) {
            throw new HttpError(409, 'One or more seats are held by another user');
          }
        }
        const price = seats.reduce((sum, s) => sum + s.price, 0);
        const [booking] = await Booking.create(
          [{ event_id: eventId, user_id: bookForUserId, total_price: price, status: 'confirmed', booking_note: note }],
          { session }
        );
        await BookingSeat.insertMany(seatIds.map((seatId) => ({ booking_id: booking._id, seat_id: seatId })), { session });
        // Guarded write: only seats that were not sold in the meantime may flip.
        const r = await Seat.updateMany(
          { _id: { $in: seatIds }, status: { $ne: 'booked' } },
          { $set: { status: 'booked', heldBy: null, heldUntil: null, heldSince: null } },
          { session }
        );
        if (r.matchedCount !== seatIds.length) throw new HttpError(409, 'One or more seats are already booked');
        bookingId = booking._id;
      });
      return res.status(201).json({ success: true, booking_id: String(bookingId), seats_booked: seatIds.length });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new HttpError(409, 'One or more seats are already booked');
      throw e;
    } finally {
      await session.endSession();
    }
  } catch (err) {
    return handleApiError(res, err, '[api/admin/booking]');
  }
}
