import mongoose from 'mongoose';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Seat from '../../models/Seat.js';

export const HOLD_DURATION_MS = 10 * 60 * 1000;
export const MAX_HOLD_LIFETIME_MS = 15 * 60 * 1000;

/** Lazily free holds that have run out. Called from hold/bookings, never from a plain read. */
export async function expireStaleHolds(eventId: string, now = new Date(), session?: mongoose.ClientSession) {
  await Seat.updateMany(
    { event_id: eventId, status: 'reserved', heldBy: { $ne: null }, heldUntil: { $lt: now } },
    { $set: { status: 'available', heldBy: null, heldUntil: null, heldSince: null } },
    session ? { session } : undefined
  );
}

/** Seats the user already owns for this event through confirmed or pending bookings. */
export async function countCommittedSeats(userId: string, eventId: string, session?: mongoose.ClientSession) {
  const bookings = await Booking.find({
    event_id: eventId,
    user_id: userId,
    status: { $in: ['confirmed', 'pending'] },
  })
    .select('_id')
    .session(session ?? null)
    .lean();
  if (bookings.length === 0) return 0;
  return BookingSeat.countDocuments({ booking_id: { $in: bookings.map((b) => b._id) } }).session(session ?? null);
}
