import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { badRequest, handleApiError } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';
import { BOOKING_STATUSES, setBookingStatus, type BookingStatus } from './_status.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bookingId = objectId(body.bookingId);
    const status = body.status;
    if (typeof status !== 'string' || !BOOKING_STATUSES.includes(status as BookingStatus)) {
      throw badRequest(`status must be one of: ${BOOKING_STATUSES.join(', ')}`);
    }
    await dbConnect();

    const booking = await setBookingStatus(bookingId, status as BookingStatus);
    return res.status(200).json(booking);
  } catch (err) {
    return handleApiError(res, err, '[api/bookings/status]');
  }
}
