import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAuth } from '../_utils/auth.js';
import { forbidden, handleApiError, HttpError, notFound } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { objectId, objectIdArray } from '../_utils/validate.js';
import { countCommittedSeats, expireStaleHolds, HOLD_DURATION_MS, MAX_HOLD_LIFETIME_MS } from './_holds.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = await requireAuth(req);
    rateLimit(req, { bucket: 'seat-hold', limit: 30, windowMs: 60_000, key: userId });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventId = objectId(body.eventId);
    const seatIds = objectIdArray(body.seatIds, { max: 10, noun: 'seats' });

    await dbConnect();

    const event = (await Event.findById(eventId).lean()) as
      | { is_published?: boolean; is_bookings_open?: boolean; date?: Date; max_seats_per_user?: number; banned_users?: string[] }
      | null;
    if (!event) throw notFound('Event not found');
    if (!event.is_published) throw forbidden('Event is not published');
    if (event.is_bookings_open === false) throw forbidden('Bookings are closed for this event');
    if (event.date && new Date(event.date).getTime() < Date.now()) throw forbidden('Event has already started');
    if (Array.isArray(event.banned_users) && event.banned_users.includes(userId)) {
      throw forbidden('You are not allowed to book this event');
    }

    // Every seat must belong to this event and be sellable.
    const found = await Seat.find({ _id: { $in: seatIds }, event_id: eventId }).select('seat_type').lean();
    if (found.length !== seatIds.length) throw new HttpError(400, 'One or more seats do not belong to this event');
    if (found.some((s) => s.seat_type === 'blocked')) throw new HttpError(409, 'One or more seats are not available');

    const now = new Date();
    await expireStaleHolds(eventId, now);

    const maxPerUser = event.max_seats_per_user ?? 10;
    const committed = await countCommittedSeats(userId, eventId);
    const activeHolds = await Seat.find({
      event_id: eventId, heldBy: userId, status: 'reserved', heldUntil: { $gt: now },
    }).select('_id').lean();
    const alreadyHeldIds = new Set(activeHolds.map((s) => String(s._id)));
    const newlyNeeded = seatIds.filter((id) => !alreadyHeldIds.has(id));
    if (committed + activeHolds.length + newlyNeeded.length > maxPerUser) {
      throw new HttpError(409, `You can hold at most ${maxPerUser} seats for this event`);
    }

    // Atomic acquire. New acquisitions get heldSince = now; refreshes keep their original
    // heldSince and heldUntil is capped at heldSince + 15 minutes (no infinite refresh).
    const result = await Seat.updateMany(
      {
        _id: { $in: seatIds },
        event_id: eventId,
        seat_type: { $ne: 'blocked' },
        $or: [
          { status: 'available' },
          { status: 'reserved', heldUntil: { $lt: now } },
          { status: 'reserved', heldBy: userId, heldUntil: { $gt: now } },
        ],
      },
      [
        {
          $set: {
            heldSince: {
              $cond: [
                { $and: [{ $eq: ['$status', 'reserved'] }, { $eq: ['$heldBy', userId] }, { $gt: ['$heldUntil', now] }, { $ne: ['$heldSince', null] }] },
                '$heldSince',
                now,
              ],
            },
            status: 'reserved',
            heldBy: userId,
          },
        },
        {
          $set: {
            heldUntil: {
              $min: [new Date(now.getTime() + HOLD_DURATION_MS), { $add: ['$heldSince', MAX_HOLD_LIFETIME_MS] }],
            },
          },
        },
      ] as any,
      { updatePipeline: true }
    );

    const rollback = async () => {
      const toRelease = seatIds.filter((id) => !alreadyHeldIds.has(id));
      if (toRelease.length > 0) {
        await Seat.updateMany(
          { _id: { $in: toRelease }, heldBy: userId, heldSince: now },
          { $set: { status: 'available', heldBy: null, heldUntil: null, heldSince: null } }
        );
      }
    };

    if (result.matchedCount !== seatIds.length) {
      await rollback();
      throw new HttpError(409, 'One or more seats are no longer available');
    }

    // Re-check the cap after the write: concurrent requests from the same user can each pass the
    // pre-check. Whoever sees the total over the cap rolls back what it just took.
    const heldNow = await Seat.countDocuments({
      event_id: eventId, heldBy: userId, status: 'reserved', heldUntil: { $gt: now },
    });
    const committedNow = await countCommittedSeats(userId, eventId);
    if (heldNow + committedNow > maxPerUser) {
      await rollback();
      throw new HttpError(409, `You can hold at most ${maxPerUser} seats for this event`);
    }

    const held = await Seat.find({ _id: { $in: seatIds } }).select('heldUntil').lean();
    const heldUntil = held.reduce<Date | null>((min, s) => (!min || (s.heldUntil && s.heldUntil < min) ? s.heldUntil : min), null);
    return res.status(200).json({ held: true, heldUntil, seatIds });
  } catch (err) {
    return handleApiError(res, err, '[api/seats/hold]');
  }
}
