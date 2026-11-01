import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { getTokenFromRequest, requireAdmin } from '../_utils/auth.js';
import { handleApiError, notFound } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';
import { pickEventFields } from './_fields.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const id = objectId(req.query.id);
    await dbConnect();

    // GET /api/events/:id  single event. Unpublished events are visible to admins only.
    if (req.method === 'GET') {
      const raw = await Event.findById(id).lean();
      if (!raw) throw notFound('Event not found');
      let isAdmin = false;
      if (getTokenFromRequest(req)) {
        try { isAdmin = !!(await requireAdmin(req)); } catch { isAdmin = false; }
      }
      if (!raw.is_published && !isAdmin) throw notFound('Event not found');
      res.setHeader(
        'Cache-Control',
        raw.is_published && !isAdmin
          ? 'public, s-maxage=30, stale-while-revalidate=60'
          : 'private, no-store'
      );
      return res.status(200).json({ ...raw, id: String(raw._id) });
    }

    // PUT /api/events/:id  update event (admin only), whitelisted fields
    if (req.method === 'PUT') {
      await requireAdmin(req);
      const update = pickEventFields(req.body, true);
      const raw = await Event.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
      if (!raw) throw notFound('Event not found');
      return res.status(200).json({ ...raw, id: String(raw._id) });
    }

    // DELETE /api/events/:id  cascade delete (admin only)
    if (req.method === 'DELETE') {
      await requireAdmin(req);
      const session = await mongoose.startSession();
      try {
        let found = true;
        await session.withTransaction(async () => {
          const event = await Event.findByIdAndDelete(id).session(session);
          if (!event) { found = false; return; }
          const bookings = await Booking.find({ event_id: id }).select('_id').session(session).lean();
          const bookingIds = bookings.map((b) => b._id);
          await Seat.deleteMany({ event_id: id }, { session });
          await Booking.deleteMany({ event_id: id }, { session });
          if (bookingIds.length) await BookingSeat.deleteMany({ booking_id: { $in: bookingIds } }, { session });
        });
        if (!found) throw notFound('Event not found');
        return res.status(204).end();
      } finally {
        await session.endSession();
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(res, err, '[api/events/[id]]');
  }
}
