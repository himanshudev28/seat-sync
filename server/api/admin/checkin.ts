import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Booking from '../../models/Booking.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError, notFound } from '../_utils/http.js';
import { bool, objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bookingId = objectId(body.bookingId);
    const isCheckedIn = body.checked_in === undefined ? true : bool(body.checked_in);
    await dbConnect();

    // Only confirmed bookings can be checked in; undoing a check-in is always allowed.
    const booking = await Booking.findOneAndUpdate(
      isCheckedIn ? { _id: bookingId, status: 'confirmed' } : { _id: bookingId },
      { checked_in: isCheckedIn, checked_in_at: isCheckedIn ? new Date() : null },
      { new: true }
    );
    if (!booking) throw notFound('Booking not found or not confirmed');

    return res.status(200).json({ id: booking._id, checked_in: booking.checked_in, checked_in_at: booking.checked_in_at });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/checkin]');
  }
}
