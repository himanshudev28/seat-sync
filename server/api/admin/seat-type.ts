import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Seat, { SEAT_TYPES, type SeatType } from '../../models/Seat.js';
import BookingSeat from '../../models/BookingSeat.js';
import Booking from '../../models/Booking.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { badRequest, handleApiError } from '../_utils/http.js';
import { objectIdArray, str } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    const { seat_type, label, forceStatus } = (req.body ?? {}) as {
      seat_type?: SeatType;
      label?: string | null;
      forceStatus?: 'available' | 'reserved' | 'booked';
    };

    const seatIds = objectIdArray((req.body ?? {}).seatIds, { max: 500 });
    if (seat_type !== undefined && !(SEAT_TYPES as readonly string[]).includes(seat_type as string)) {
      throw badRequest(`seat_type must be one of: ${SEAT_TYPES.join(', ')}`);
    }
    if (forceStatus !== undefined && !['available', 'reserved', 'booked'].includes(forceStatus as string)) {
      throw badRequest('forceStatus must be available, reserved or booked');
    }
    if (label !== undefined && label !== null) str(label, { max: 50 });
    await dbConnect();

    const update: Record<string, unknown> = {};
    if (seat_type !== undefined) update.seat_type = seat_type;
    if (label !== undefined) update.label = label;

    let cancelledBookings = 0;
    let deletedBookingSeats = 0;

    if (forceStatus === 'available') {
      // ── When resetting a seat to available, we must:
      // 1. Delete BookingSeat junction rows for these seats
      // 2. For any Booking that now has NO remaining seats → cancel it
      // 3. Update the seat itself
      update.status = 'available';
      update.heldBy = null;
      update.heldUntil = null;
      update.seat_type = seat_type ?? 'standard';

      // Find which bookings referenced these seats
      const bookingSeats = await BookingSeat.find({ seat_id: { $in: seatIds } }).lean();
      const bookingIds = [...new Set(bookingSeats.map((bs: any) => String(bs.booking_id)))];

      // Delete the junction rows
      const delResult = await BookingSeat.deleteMany({ seat_id: { $in: seatIds } });
      deletedBookingSeats = delResult.deletedCount ?? 0;

      if (bookingIds.length > 0) {
        const bookingObjectIds = bookingIds.map((id) => new mongoose.Types.ObjectId(id));
        // One aggregation tells us which affected bookings still have seats left,
        // instead of one countDocuments query per booking (former N+1).
        const stillHaveSeats = await BookingSeat.aggregate([
          { $match: { booking_id: { $in: bookingObjectIds } } },
          { $group: { _id: '$booking_id' } },
        ]);
        const withSeats = new Set(stillHaveSeats.map((r: any) => String(r._id)));
        const toCancel = bookingObjectIds.filter((id) => !withSeats.has(String(id)));
        if (toCancel.length > 0) {
          // One bulk update cancels every now-empty booking at once.
          const cancelResult = await Booking.updateMany(
            { _id: { $in: toCancel } },
            { $set: { status: 'cancelled' } }
          );
          cancelledBookings = cancelResult.modifiedCount ?? 0;
        }
      }
    } else if (forceStatus) {
      update.status = forceStatus;
    } else if (seat_type === 'blocked') {
      update.status = 'reserved';
      update.heldBy = null;
      update.heldUntil = null;
    }

    const result = await Seat.updateMany({ _id: { $in: seatIds } }, { $set: update });

    return res.status(200).json({
      modified: result.modifiedCount,
      cancelledBookings,
      deletedBookingSeats,
    });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/seat-type]');
  }
}
