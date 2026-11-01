import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { objectId } from '../_utils/validate.js';

// TODO(client): put booking.ticket_token (not the booking id) in the QR and scan URL. The id is
// still accepted here so tickets already issued keep working.

const OBJECT_ID = /^[a-f\d]{24}$/i;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** Resolve a booking by ticket token or by id. Null for anything malformed or unknown. */
async function findBooking(key: unknown) {
  if (typeof key !== 'string') return null;
  if (TOKEN.test(key)) return Booking.findOne({ ticket_token: key }).lean();
  if (OBJECT_ID.test(key)) return Booking.findById(key).lean();
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = req.query.bookingId;

    // GET: public, read-only, rate limited per IP. Reveals only the state of the ticket.
    if (req.method === 'GET') {
      rateLimit(req, { bucket: 'validate-get', limit: 60, windowMs: 60_000 });
      await dbConnect();
      const booking = await findBooking(key);
      if (!booking) return res.status(404).json({ valid: false });
      return res.status(200).json({
        valid: booking.status === 'confirmed',
        status: booking.status,
        checkedIn: !!booking.checked_in,
        checkedInAt: booking.checked_in_at ?? null,
      });
    }

    // POST: admin check-in. Atomic and idempotent.
    if (req.method === 'POST') {
      const admin = await requireAdmin(req);
      await dbConnect();
      const eventId = (req.body ?? {}).eventId === undefined ? undefined : objectId((req.body ?? {}).eventId);

      const found = await findBooking(key);
      if (!found) return res.status(404).json({ result: 'NOT_FOUND' });
      if (eventId && String(found.event_id) !== eventId) return res.status(409).json({ result: 'WRONG_EVENT' });
      if (found.status !== 'confirmed') return res.status(409).json({ result: 'NOT_CONFIRMED', status: found.status });

      const now = new Date();
      const updated = await Booking.findOneAndUpdate(
        { _id: found._id, status: 'confirmed', checked_in: false },
        { $set: { checked_in: true, checked_in_at: now, checked_in_by: admin.userId } },
        { new: true }
      ).lean();
      if (updated) {
        return res.status(200).json({ result: 'CHECKED_IN', checkedInAt: updated.checked_in_at, checkedInBy: updated.checked_in_by });
      }

      // Lost the race or a repeat scan: report the original check-in, not an error.
      const again = await Booking.findById(found._id).lean();
      if (!again || again.status !== 'confirmed') {
        return res.status(409).json({ result: 'NOT_CONFIRMED', status: again?.status });
      }
      return res.status(200).json({ result: 'ALREADY_USED', checkedInAt: again.checked_in_at, checkedInBy: again.checked_in_by ?? null });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(res, err, '[api/validate]');
  }
}
