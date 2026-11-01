import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Seat from '../../models/Seat.js';
import { HttpError, notFound } from '../_utils/http.js';

export const BOOKING_STATUSES = ['confirmed', 'pending', 'cancelled', 'refunded'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
const ACTIVE = ['confirmed', 'pending'];

/**
 * Change a booking's status and keep its seats consistent, in one transaction.
 * - to cancelled/refunded: delete the BookingSeat links and free the seats that are still 'booked'
 * - cancelled/refunded back to an active status: refused (the links are gone and the seats may have
 *   been re-sold), the customer must re-book
 * - confirmed <-> pending: no seat change
 */
export async function setBookingStatus(bookingId: string, status: BookingStatus, extra: Record<string, unknown> = {}) {
  const session = await mongoose.startSession();
  try {
    let result: unknown = null;
    await session.withTransaction(async () => {
      const current = await Booking.findById(bookingId).session(session);
      if (!current) throw notFound('Booking not found');
      const wasActive = ACTIVE.includes(current.status);
      const willBeActive = ACTIVE.includes(status);
      if (!wasActive && willBeActive) {
        throw new HttpError(409, 'A cancelled or refunded booking cannot be restored. Create a new booking instead.');
      }
      if (wasActive && !willBeActive) {
        const links = await BookingSeat.find({ booking_id: bookingId }).select('seat_id').session(session).lean();
        const seatIds = links.map((l) => l.seat_id);
        if (seatIds.length) {
          await BookingSeat.deleteMany({ booking_id: bookingId }, { session });
          await Seat.updateMany(
            { _id: { $in: seatIds }, status: 'booked' },
            { $set: { status: 'available', heldBy: null, heldUntil: null, heldSince: null } },
            { session }
          );
        }
      }
      result = await Booking.findByIdAndUpdate(bookingId, { $set: { status, ...extra } }, { new: true, session }).lean();
    });
    return result;
  } finally {
    await session.endSession();
  }
}
