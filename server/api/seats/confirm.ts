import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../_utils/cors.js';

/**
 * Retired. Confirming seats without a Booking left seats sold with nothing to show for it.
 * Booking is done in a single step by POST /api/bookings.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(410).json({ error: 'Gone. Seats are booked with POST /api/bookings.' });
}
