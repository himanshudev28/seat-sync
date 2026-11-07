import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import Event from '../../models/Event.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { badRequest, handleApiError } from '../_utils/http.js';
import { clampInt, objectId } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    const { action, userId } = (req.body ?? {}) as {
      action: 'toggle_bookings' | 'ban_user' | 'unban_user' | 'set_limit' | 'toggle_featured' | 'toggle_spotlight';
      userId?: string;
      limit?: number;
    };

    /** Only two spotlight cards fit over the hero image. */
    const SPOTLIGHT_LIMIT = 2;

    const eventId = objectId((req.body ?? {}).eventId);
    if (!action) throw badRequest('action is required');
    if (userId !== undefined && action.includes('ban')) objectId(userId);
    await dbConnect();

    const update: Record<string, unknown> = {};

    if (action === 'toggle_bookings') {
      const event = await Event.findById(eventId).lean();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      update.is_bookings_open = !(event as any).is_bookings_open;
    } else if (action === 'ban_user') {
      if (!userId) return res.status(400).json({ error: 'userId is required for ban_user action' });
      const event = await Event.findById(eventId).lean();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      // Atomic $addToSet: a read-modify-write here lost concurrent bans.
      const added = await Event.findByIdAndUpdate(eventId, { $addToSet: { banned_users: userId } }, { new: true }).lean();
      return res.status(200).json(added);
    } else if (action === 'unban_user') {
      if (!userId) return res.status(400).json({ error: 'userId is required for unban_user action' });
      const event = await Event.findById(eventId).lean();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const pulled = await Event.findByIdAndUpdate(eventId, { $pull: { banned_users: userId } }, { new: true }).lean();
      return res.status(200).json(pulled);
    } else if (action === 'toggle_featured') {
      const event = await Event.findById(eventId).lean();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      update.is_featured = !(event as any).is_featured;
    } else if (action === 'toggle_spotlight') {
      const event = await Event.findById(eventId).lean();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const next = !(event as any).is_spotlight;
      if (next) {
        const current = await Event.countDocuments({
          // Only events the curation UI shows: drafts and past events must not hold a slot.
          is_spotlight: true, is_published: true, date: { $gte: new Date() }, _id: { $ne: eventId },
        });
        if (current >= SPOTLIGHT_LIMIT) {
          return res.status(409).json({
            error: `Only ${SPOTLIGHT_LIMIT} events can be spotlighted. Remove one first.`,
          });
        }
      }
      update.is_spotlight = next;
    } else if (action === 'set_limit') {
      const { limit } = req.body as { limit?: number | null };
      if (limit === undefined) return res.status(400).json({ error: 'limit is required for set_limit action' });
      update.max_tickets_per_event = limit === null ? null : clampInt(limit, 0, 0, 1_000_000);
    } else {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const updated = await Event.findByIdAndUpdate(eventId, { $set: update }, { new: true }).lean();
    if (!updated) return res.status(404).json({ error: 'Event not found' });

    return res.status(200).json(updated);
  } catch (err) {
    return handleApiError(res, err, '[api/admin/event-control]');
  }
}
