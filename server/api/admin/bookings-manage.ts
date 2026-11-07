import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Seat from '../../models/Seat.js';
import User from '../../models/User.js';
import Event from '../../models/Event.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { HttpError, badRequest, handleApiError, notFound } from '../_utils/http.js';
import { clampInt, escapeRegex, objectId, str } from '../_utils/validate.js';
import { BOOKING_STATUSES, setBookingStatus, type BookingStatus } from '../bookings/_status.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function validDate(v: unknown): Date {
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw badRequest('Invalid date');
  return d;
}

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' (or any date string) -> start of that calendar day in the admin's timezone. */
function dayStart(v: unknown, tzMinutes: number): Date {
  const d = validDate(v);
  // Date-only strings parse as UTC midnight; shift by the client's getTimezoneOffset().
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(utcMidnight + tzMinutes * 60_000);
}

function buildFilter(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};

  if (query.eventId) filter.event_id = objectId(query.eventId);
  if (query.status === 'checked-in') {
    // The UI offers "checked-in" as a status; it is a flag on confirmed bookings.
    filter.checked_in = true;
    filter.status = 'confirmed';
  } else if (query.status) {
    if (typeof query.status !== 'string' || !BOOKING_STATUSES.includes(query.status as BookingStatus)) {
      throw badRequest('Invalid status');
    }
    filter.status = query.status;
  }
  if (query.checked_in !== undefined) filter.checked_in = query.checked_in === 'true';

  if (query.dateFrom || query.dateTo) {
    const tz = query.tz === undefined || query.tz === '' ? 0 : Number(query.tz);
    if (!Number.isFinite(tz) || Math.abs(tz) > 14 * 60) throw badRequest('Invalid tz');
    // Whole days: [start of dateFrom, start of the day after dateTo).
    const dateFilter: Record<string, Date> = {};
    if (query.dateFrom) dateFilter.$gte = dayStart(query.dateFrom, tz);
    if (query.dateTo) dateFilter.$lt = new Date(dayStart(query.dateTo, tz).getTime() + DAY_MS);
    filter.created_at = dateFilter;
  }

  return filter;
}

async function getBookingsWithDetails(filter: Record<string, unknown>, options: {
  skip: number;
  limit: number;
  search?: string;
}) {
  const { skip, limit, search } = options;

  let bookingFilter = { ...filter };

  // If search is provided, first find matching users/events
  if (typeof search === 'string' && search.trim()) {
    const s = escapeRegex(str(search, { max: 100 }));
    const raw = search.trim();
    const [matchingUsers, matchingEvents] = await Promise.all([
      User.find({
        $or: [
          { email: { $regex: s, $options: 'i' } },
          { first_name: { $regex: s, $options: 'i' } },
          { last_name: { $regex: s, $options: 'i' } },
        ],
      }).select('_id').lean(),
      Event.find({ title: { $regex: s, $options: 'i' } }).select('_id').lean(),
    ]);

    const userIds = matchingUsers.map((u) => (u as { _id: unknown })._id);
    const eventIds = matchingEvents.map((e) => (e as { _id: unknown })._id);

    // Also try matching booking _id directly if it looks valid
    const orClauses: unknown[] = [];
    if (userIds.length) orClauses.push({ user_id: { $in: userIds } });
    if (eventIds.length) orClauses.push({ event_id: { $in: eventIds } });
    if (/^[a-f\d]{24}$/i.test(raw)) orClauses.push({ _id: new mongoose.Types.ObjectId(raw) });

    if (orClauses.length === 0) return { bookings: [], total: 0 };

    bookingFilter = { ...bookingFilter, $or: orClauses };
  }

  const [rawBookings, total] = await Promise.all([
    Booking.find(bookingFilter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments(bookingFilter),
  ]);

  if (!rawBookings.length) return { bookings: [], total };

  const typedBookings = rawBookings as unknown as Array<{
    _id: mongoose.Types.ObjectId;
    event_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    status: string;
    total_price: number;
    checked_in: boolean;
    checked_in_at: Date | null;
    booking_note: string | null;
    created_at: Date;
    updated_at: Date;
  }>;

  // Batch-load events and users
  const eventIds = [...new Set(typedBookings.map((b) => String(b.event_id)))];
  const userIds = [...new Set(typedBookings.map((b) => String(b.user_id)))];

  const [events, users] = await Promise.all([
    Event.find({ _id: { $in: eventIds } })
      .select('title date location price category image_url is_free')
      .lean() as Promise<Array<{
        _id: unknown; title: string; date: Date; location: string;
        price: number; category: string; image_url: string | null; is_free: boolean;
      }>>,
    User.find({ _id: { $in: userIds } })
      .select('first_name last_name email phone_number student_id avatar_url')
      .lean() as Promise<Array<{
        _id: unknown; first_name: string | null; last_name: string | null;
        email: string; phone_number: string | null; student_id: string | null; avatar_url: string | null;
      }>>,
  ]);

  const eventMap = new Map(events.map((e) => [String(e._id), e]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Batch-load booking seats
  const bookingIds = typedBookings.map((b) => b._id);
  const bookingSeats = await BookingSeat.find({ booking_id: { $in: bookingIds } })
    .populate('seat_id', 'row number seat_type label price status')
    .lean() as unknown as Array<{
      booking_id: mongoose.Types.ObjectId;
      seat_id: {
        _id: unknown; row: string; number: number;
        seat_type: string; label: string | null; price: number; status: string;
      } | null;
    }>;

  const seatsMap = new Map<string, typeof bookingSeats>();
  for (const bs of bookingSeats) {
    const key = String(bs.booking_id);
    if (!seatsMap.has(key)) seatsMap.set(key, []);
    seatsMap.get(key)!.push(bs);
  }

  const bookings = typedBookings.map((b) => {
    const event = eventMap.get(String(b.event_id));
    const user = userMap.get(String(b.user_id));
    const seats = (seatsMap.get(String(b._id)) ?? [])
      .filter((bs) => bs.seat_id)
      .map((bs) => ({
        seat_id: String(bs.seat_id!._id),
        row: bs.seat_id!.row,
        number: bs.seat_id!.number,
        label: bs.seat_id!.label || `${bs.seat_id!.row}${bs.seat_id!.number}`,
        seat_type: bs.seat_id!.seat_type,
        price: bs.seat_id!.price,
        status: bs.seat_id!.status,
      }));

    return {
      id: String(b._id),
      status: b.status,
      total_price: b.total_price,
      checked_in: b.checked_in,
      checked_in_at: b.checked_in_at,
      booking_note: b.booking_note,
      created_at: b.created_at,
      updated_at: b.updated_at,
      seat_count: seats.length,
      seats,
      event: event
        ? {
            id: String(event._id),
            title: event.title,
            date: event.date,
            location: event.location,
            price: event.price,
            category: event.category,
            image_url: event.image_url,
            is_free: event.is_free,
          }
        : null,
      user: user
        ? {
            id: String(user._id),
            name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown',
            email: user.email,
            phone: user.phone_number,
            student_id: user.student_id,
            avatar_url: user.avatar_url,
          }
        : null,
    };
  });

  return { bookings, total };
}

// ── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await requireAdmin(req);
    await dbConnect();

    // GET: list bookings
    if (req.method === 'GET') {
      const q = req.query as Record<string, string>;
      const pageNum = clampInt(q.page, 1, 1, 100_000);
      const limitNum = clampInt(q.limit, 20, 1, 100);
      const skip = (pageNum - 1) * limitNum;

      const filter = buildFilter({ eventId: q.eventId, status: q.status, checked_in: q.checked_in, dateFrom: q.dateFrom, dateTo: q.dateTo, tz: q.tz });
      const { bookings, total } = await getBookingsWithDetails(filter, { skip, limit: limitNum, search: q.search });

      return res.status(200).json({
        data: bookings,
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      });
    }

    // PATCH: update booking status / checked_in / note
    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = objectId(body.id);
      let status = body.status;
      let checkedIn = body.checked_in;

      // The UI sends 'checked-in' as a status; it is a flag on the booking, not a status.
      if (status === 'checked-in') { checkedIn = true; status = undefined; }
      if (status !== undefined && (typeof status !== 'string' || !BOOKING_STATUSES.includes(status as BookingStatus))) {
        throw badRequest(`status must be one of: ${BOOKING_STATUSES.join(', ')}, checked-in`);
      }
      if (checkedIn !== undefined && typeof checkedIn !== 'boolean') throw badRequest('checked_in must be a boolean');

      const extra: Record<string, unknown> = {};
      if (checkedIn !== undefined) {
        extra.checked_in = checkedIn;
        extra.checked_in_at = checkedIn ? new Date() : null;
      }
      if (body.booking_note !== undefined) {
        extra.booking_note = body.booking_note === null ? null : str(body.booking_note, { max: 500 });
      }
      if (status === undefined && !Object.keys(extra).length) throw badRequest('Nothing to update');

      let booking;
      if (status !== undefined) {
        // Moves seats in the same transaction (frees them and drops the BookingSeat links).
        booking = await setBookingStatus(id, status as BookingStatus, extra);
      } else {
        // Only a confirmed booking can be checked in (same rule as admin/checkin.ts); undoing is always allowed.
        const cond: Record<string, unknown> = extra.checked_in === true ? { _id: id, status: 'confirmed' } : { _id: id };
        booking = await Booking.findOneAndUpdate(cond, { $set: extra }, { new: true }).lean();
        if (!booking) {
          if (extra.checked_in === true && await Booking.exists({ _id: id })) {
            throw new HttpError(409, 'Only confirmed bookings can be checked in');
          }
          throw notFound('Booking not found');
        }
      }
      return res.status(200).json({ success: true, booking });
    }

    // DELETE: hard delete a booking and free its seats, in one transaction
    if (req.method === 'DELETE') {
      const id = objectId(((req.body ?? {}) as Record<string, unknown>).id);
      const session = await mongoose.startSession();
      try {
        let found = true;
        await session.withTransaction(async () => {
          const booking = await Booking.findById(id).session(session);
          if (!booking) { found = false; return; }
          const links = await BookingSeat.find({ booking_id: id }).select('seat_id').session(session).lean();
          const seatIds = links.map((l) => l.seat_id);
          await BookingSeat.deleteMany({ booking_id: id }, { session });
          if (seatIds.length) {
            await Seat.updateMany(
              { _id: { $in: seatIds }, status: 'booked' },
              { $set: { status: 'available', heldBy: null, heldUntil: null, heldSince: null } },
              { session }
            );
          }
          await booking.deleteOne({ session });
        });
        if (!found) throw notFound('Booking not found');
      } finally {
        await session.endSession();
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/bookings-manage]');
  }
}
