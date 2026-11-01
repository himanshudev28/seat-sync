import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import dbConnect from '../db.js';
import Booking from '../models/Booking.js';
import BookingSeat from '../models/BookingSeat.js';
import Event from '../models/Event.js';
import Seat from '../models/Seat.js';
import { setCorsHeaders } from './_utils/cors.js';
import { requireAdmin, requireAuth } from './_utils/auth.js';
import { badRequest, forbidden, handleApiError, HttpError, notFound } from './_utils/http.js';
import { rateLimit } from './_utils/rateLimit.js';
import { objectId, objectIdArray } from './_utils/validate.js';
import { countCommittedSeats, expireStaleHolds } from './seats/_holds.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const authUser = await requireAuth(req);
    await dbConnect();

    // GET /api/bookings  – the caller's bookings with event + seat details (no N+1).
    // ?userId= is honoured for admins only; everyone else always gets their own.
    if (req.method === 'GET') {
      let targetUserId = authUser.userId;
      if (req.query.userId !== undefined && String(req.query.userId) !== authUser.userId) {
        await requireAdmin(req);
        targetUserId = objectId(req.query.userId);
      }

      const bookings = await Booking.find({ user_id: targetUserId })
        .populate('event_id', 'title date location price category image_url is_free')
        .sort({ created_at: -1 })
        .limit(100)
        .lean();

      // Backfill the ticket token for bookings made before tokens existed.
      const missing = bookings.filter((b) => !(b as { ticket_token?: string }).ticket_token);
      if (missing.length) {
        await Booking.bulkWrite(missing.map((b) => {
          const token = randomBytes(16).toString('base64url');
          (b as { ticket_token?: string }).ticket_token = token;
          return { updateOne: { filter: { _id: b._id, ticket_token: { $exists: false } }, update: { $set: { ticket_token: token } } } };
        }));
      }

      const bookingIds = bookings.map((b) => b._id);
      const allBookingSeats = await BookingSeat.find({ booking_id: { $in: bookingIds } })
        .populate('seat_id')
        .lean();

      // Group seats by booking id in one pass – avoids N+1
      const seatsByBooking = new Map<string, unknown[]>();
      for (const bs of allBookingSeats) {
        const key = (bs.booking_id as mongoose.Types.ObjectId).toString();
        if (!seatsByBooking.has(key)) seatsByBooking.set(key, []);
        seatsByBooking.get(key)!.push({ seat: bs.seat_id });
      }

      const enriched = bookings.map((b) => ({
        ...b,
        event: (b as { event_id: unknown }).event_id,
        booking_seats: seatsByBooking.get(b._id.toString()) ?? [],
      }));

      return res.status(200).json(enriched);
    }

    // POST /api/bookings  – atomic: verify holds -> enforce guards -> create booking ->
    //                       link seats -> mark booked, all in one transaction.
    if (req.method === 'POST') {
      rateLimit(req, { bucket: 'booking-create', limit: 20, windowMs: 60_000, key: authUser.userId });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const eventId = objectId(body.eventId);
      const seatIds = objectIdArray(body.seatIds, { max: 10, noun: 'seats' });
      const totalPrice = body.totalPrice;
      if (totalPrice !== undefined && (typeof totalPrice !== 'number' || !Number.isFinite(totalPrice))) {
        throw badRequest('Invalid totalPrice');
      }

      const event = (await Event.findById(eventId).lean()) as
        | { is_published?: boolean; is_bookings_open?: boolean; date?: Date; max_seats_per_user?: number; banned_users?: string[] }
        | null;
      if (!event) throw notFound('Event not found');
      if (!event.is_published) throw forbidden('Event is not published');
      if (event.is_bookings_open === false) throw forbidden('Bookings are closed for this event');
      if (event.date && new Date(event.date).getTime() < Date.now()) throw forbidden('Event has already started');
      if (Array.isArray(event.banned_users) && event.banned_users.includes(authUser.userId)) {
        throw forbidden('You are not allowed to book this event');
      }

      const maxPerUser = event.max_seats_per_user ?? 10;
      if (seatIds.length > maxPerUser) {
        throw badRequest(`Cannot book more than ${maxPerUser} seats at once for this event`);
      }

      await expireStaleHolds(eventId);

      const session = await mongoose.startSession();
      try {
        let failure: HttpError | null = null;
        let bookingId: mongoose.Types.ObjectId | null = null;

        // withTransaction retries write conflicts: a double-submit loses on the retry because the
        // seats are no longer held, so exactly one booking comes out.
        await session.withTransaction(async () => {
          failure = null;
          const now = new Date();

          // Cap check inside the transaction; counts confirmed + pending.
          const existing = await countCommittedSeats(authUser.userId, eventId, session);
          if (existing + seatIds.length > maxPerUser) {
            failure = badRequest(`Booking limit exceeded. You can book at most ${maxPerUser} seats for this event (already have ${existing}).`);
            return;
          }

          const heldSeats = await Seat.find({
            _id: { $in: seatIds },
            event_id: eventId,
            seat_type: { $ne: 'blocked' },
            heldBy: authUser.userId,
            status: 'reserved',
            heldUntil: { $gt: now },
          }).session(session);

          if (heldSeats.length !== seatIds.length) {
            failure = new HttpError(409, 'One or more seat holds have expired. Please re-select your seats');
            return;
          }

          // Server is the source of truth for price.
          const serverPrice = heldSeats.reduce((sum, s) => sum + s.price, 0);
          if (typeof totalPrice === 'number' && Math.abs(totalPrice - serverPrice) > 0.01) {
            failure = badRequest('Price mismatch. Please refresh and retry');
            return;
          }

          const [booking] = await Booking.create(
            [{ event_id: eventId, user_id: authUser.userId, total_price: serverPrice, status: 'confirmed' }],
            { session }
          );
          await BookingSeat.insertMany(
            seatIds.map((seatId) => ({ booking_id: booking._id, seat_id: seatId })),
            { session }
          );
          await Seat.updateMany(
            { _id: { $in: seatIds }, event_id: eventId },
            { $set: { status: 'booked', heldBy: null, heldUntil: null, heldSince: null } },
            { session }
          );
          bookingId = booking._id;
        });

        if (failure) throw failure;
        const populated = await Booking.findById(bookingId).populate('event_id').lean();
        return res.status(201).json(populated);
      } catch (e) {
        // A duplicate seat link means someone else booked it first.
        if ((e as { code?: number }).code === 11000) throw new HttpError(409, 'One or more seats are no longer available');
        throw e;
      } finally {
        await session.endSession();
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(res, err, '[api/bookings]');
  }
}
