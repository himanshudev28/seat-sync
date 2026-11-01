import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../db.js';
import Seat from '../models/Seat.js';
import Booking from '../models/Booking.js';
import BookingSeat from '../models/BookingSeat.js';
import { requireAuth, type AuthUser } from './_utils/auth.js';
import { setCorsHeaders } from './_utils/cors.js';
import { HttpError, handleApiError } from './_utils/http.js';
import { objectId } from './_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const eventId = objectId(req.query.eventId);
    await dbConnect();

    // Read-only: expired holds are freed lazily by hold/bookings. A seat whose hold has run out
    // is reported as available here so the map is right without writing on every read.
    const now = Date.now();
    const raw = await Seat.find({ event_id: eventId })
      .select('row number status seat_type label price event_id updated_at heldUntil heldBy')
      .sort({ row: 1, number: 1 })
      .lean();

    // Optional auth: signed-in users also learn which seats are theirs (never who holds the others).
    let me: AuthUser | null = null;
    try {
      me = await requireAuth(req);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
    }
    let mine = new Set<string>();
    if (me) {
      const myBookings = await Booking.find({
        event_id: eventId,
        user_id: me.userId,
        status: { $in: ['confirmed', 'pending'] },
      })
        .select('_id')
        .lean();
      if (myBookings.length) {
        const links = await BookingSeat.find({ booking_id: { $in: myBookings.map((b) => b._id) } })
          .select('seat_id')
          .lean();
        mine = new Set(links.map((l) => String(l.seat_id)));
      }
    }

    const seats = raw.map((s) => {
      const { heldUntil, heldBy, ...rest } = s as typeof s & { heldUntil?: Date | null; heldBy?: unknown };
      const expired = s.status === 'reserved' && heldBy && heldUntil && new Date(heldUntil).getTime() < now;
      const base = expired ? { ...rest, status: 'available' } : rest;
      if (!me) return base;
      return {
        ...base,
        held_by_me: !expired && s.status === 'reserved' && !!heldBy && String(heldBy) === me.userId,
        booked_by_me: mine.has(String(s._id)),
      };
    });
    // Seat availability changes by the second and may carry per-user flags: never cache it.
    res.setHeader('Cache-Control', 'private, no-store');

    // Lightweight etag so frontend can skip re-renders when nothing changed
    const etag = String(raw.reduce((max, s) => {
      const t = new Date((s as { updated_at?: Date }).updated_at || 0).getTime();
      return t > max ? t : max;
    }, 0));
    res.setHeader('x-seats-etag', etag);

    return res.status(200).json(seats);
  } catch (err) {
    return handleApiError(res, err, '[api/seats]');
  }
}
