import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Seat, { SEAT_TYPES, type SeatType } from '../../models/Seat.js';
import BookingSeat from '../../models/BookingSeat.js';
import Booking from '../../models/Booking.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { HttpError, badRequest, handleApiError } from '../_utils/http.js';
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
    const clearHolds = { heldBy: null, heldUntil: null, heldSince: null };

    let cancelledBookings = 0;
    let deletedBookingSeats = 0;
    let modified = 0;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Reset per attempt: withTransaction may retry the callback.
        cancelledBookings = 0;
        deletedBookingSeats = 0;

        if (seat_type === 'blocked' && forceStatus !== 'available') {
          // A booked seat can't be blocked out from under its customer: the admin must cancel that booking first.
          const links = await BookingSeat.find({ seat_id: { $in: seatIds } }).select('seat_id booking_id').session(session).lean();
          const activeIds = new Set(
            (await Booking.find({ _id: { $in: links.map((l) => l.booking_id) }, status: { $in: ['confirmed', 'pending'] } })
              .select('_id').session(session).lean()).map((b) => String(b._id))
          );
          const linked = links.filter((l) => activeIds.has(String(l.booking_id))).map((l) => String(l.seat_id));
          const booked = await Seat.find({ _id: { $in: seatIds }, status: 'booked' }).select('_id').session(session).lean();
          const conflict = new Set([...linked, ...booked.map((x) => String(x._id))]);
          if (conflict.size > 0) {
            throw new HttpError(409, `${conflict.size} selected seat(s) are booked. Cancel the booking first, then block the seat.`);
          }
        }

        if (forceStatus === 'available') {
          // Resetting a seat to available: drop its BookingSeat links, then fix up each affected booking.
          update.status = 'available';
          Object.assign(update, clearHolds);
          // Only blocked seats lose their type; VIP/wheelchair keep theirs unless a type was requested.
          if (seat_type === undefined) {
            await Seat.updateMany({ _id: { $in: seatIds }, seat_type: 'blocked' }, { $set: { seat_type: 'standard' } }, { session });
          }

          const bookingSeats = await BookingSeat.find({ seat_id: { $in: seatIds } }).session(session).lean();
          const bookingIds = [...new Set(bookingSeats.map((bs) => String(bs.booking_id)))];
          const delResult = await BookingSeat.deleteMany({ seat_id: { $in: seatIds } }, { session });
          deletedBookingSeats = delResult.deletedCount ?? 0;

          if (bookingIds.length > 0) {
            const bookingObjectIds = bookingIds.map((id) => new mongoose.Types.ObjectId(id));
            // Remaining seats per affected booking, in one query (no N+1).
            const remaining = await BookingSeat.find({ booking_id: { $in: bookingObjectIds } })
              .populate('seat_id', 'price').session(session).lean() as unknown as Array<{ booking_id: unknown; seat_id: { price: number } | null }>;
            const totals = new Map<string, number>();
            for (const r of remaining) {
              if (!r.seat_id) continue;
              totals.set(String(r.booking_id), (totals.get(String(r.booking_id)) ?? 0) + (r.seat_id.price ?? 0));
            }
            const toCancel = bookingObjectIds.filter((id) => !totals.has(String(id)));
            if (toCancel.length > 0) {
              const cancelResult = await Booking.updateMany(
                { _id: { $in: toCancel }, status: { $in: ['confirmed', 'pending'] } },
                { $set: { status: 'cancelled' } },
                { session }
              );
              cancelledBookings = cancelResult.modifiedCount ?? 0;
            }
            // Bookings that keep some seats: the freed seats no longer count toward the price.
            await Booking.bulkWrite(
              [...totals].map(([id, total]) => ({
                updateOne: { filter: { _id: new mongoose.Types.ObjectId(id), status: { $in: ['confirmed', 'pending'] } }, update: { $set: { total_price: total } } },
              })),
              { session }
            );
          }
        } else if (forceStatus) {
          update.status = forceStatus;
        } else if (seat_type === 'blocked') {
          update.status = 'reserved';
          Object.assign(update, clearHolds);
        } else if (seat_type !== undefined) {
          // Unblocking: a blocked seat is 'reserved'; make it sellable again (other seats keep their status).
          await Seat.updateMany(
            { _id: { $in: seatIds }, seat_type: 'blocked' },
            { $set: { status: 'available', ...clearHolds } },
            { session }
          );
        }

        const result = await Seat.updateMany({ _id: { $in: seatIds } }, { $set: update }, { session });
        modified = result.modifiedCount;
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json({ modified, cancelledBookings, deletedBookingSeats });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/seat-type]');
  }
}
