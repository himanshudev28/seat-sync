import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../db.js';
import Event from '../models/Event.js';
import Seat from '../models/Seat.js';
import { setCorsHeaders, setNoCache, setPublicCache } from './_utils/cors.js';
import { getTokenFromRequest, requireAdmin } from './_utils/auth.js';
import { handleApiError } from './_utils/http.js';
import { escapeRegex } from './_utils/validate.js';
import { pickEventFields } from './events/_fields.js';

const withIds = (rows: unknown[]) =>
  rows.map((e) => ({ ...(e as Record<string, unknown>), id: String((e as { _id: unknown })._id) }));

/**
 * Attach the live seat tally to each event.
 *
 * An Event document stores no seat fields — seats live in their own
 * collection — yet both the admin events table ("Seats"/"Sold" columns) and
 * the public event card's availability bar read `total_seats`/`sold_seats`
 * off the event. Nothing ever set them, so the admin panel showed 0 seats no
 * matter what layout had just been generated.
 *
 * `seat_rows`/`seat_columns` describe the layout actually in the database so
 * the admin's "Manage Seats" dialog can prefill with the real grid instead of
 * a hardcoded default.
 */
async function attachSeatCounts<T extends { id: string }>(events: T[]): Promise<T[]> {
  if (events.length === 0) return events;

  const ids = events.map((e) => new mongoose.Types.ObjectId(e.id));
  const grouped = await Seat.aggregate([
    { $match: { event_id: { $in: ids } } },
    {
      $group: {
        _id: '$event_id',
        total: { $sum: 1 },
        sold: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } },
        held: { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, 1, 0] } },
        rows: { $addToSet: '$row' },
        widest_row: { $max: '$number' },
      },
    },
  ]);

  const byEvent = new Map(grouped.map((g) => [String(g._id), g]));
  return events.map((e) => {
    const g = byEvent.get(e.id);
    return {
      ...e,
      total_seats: g?.total ?? 0,
      sold_seats: g?.sold ?? 0,
      held_seats: g?.held ?? 0,
      seat_rows: g?.rows?.length ?? 0,
      seat_columns: g?.widest_row ?? 0,
    };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await dbConnect();
    // GET /api/events – ?published=true, ?category=, ?featured=true,
    // ?spotlight=true, ?facets=true
    if (req.method === 'GET') {
      const { published, category, featured, spotlight, facets, fresh } = req.query;

      // ?facets=true – the distinct categories that actually have published
      // events, with counts. The home page builds its category bar from this
      // instead of a hardcoded list that drifts from the data.
      //
      // Deliberately NOT limited to upcoming events: /events lists every
      // published event, so a category bar filtered to upcoming would hide
      // pills whose events are right there in the list.
      if (facets === 'true') {
        const rows = await Event.aggregate([
          { $match: { is_published: true } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ]);
        const categories = rows
          .filter((r) => typeof r._id === 'string' && r._id.trim() !== '')
          .map((r) => ({ category: r._id as string, count: r.count as number }));
        setPublicCache(res, 30);
        return res.status(200).json(categories);
      }

      const filter: Record<string, unknown> = {};
      // Unpublished drafts are admin-only: anyone else only ever sees published events.
      let isAdmin = false;
      if (published !== 'true' && !(featured === 'true' || spotlight === 'true') && getTokenFromRequest(req)) {
        try { isAdmin = !!(await requireAdmin(req)); } catch { isAdmin = false; }
      }
      if (published === 'true' || !isAdmin) filter.is_published = true;

      // Upcoming only by default (3 h grace so an event that just started still shows).
      // ?include=past is admin only.
      if (req.query.include === 'past') {
        isAdmin = !!(await requireAdmin(req));
        if (published === 'true') filter.is_published = true; else delete filter.is_published;
      } else {
        filter.date = { $gte: new Date(Date.now() - 3 * 3600_000) };
      }
      // Case-insensitive exact match: links can carry "concert" while the
      // stored value is "Concert".
      if (typeof category === 'string' && category) {
        filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
      }

      const isCurated = featured === 'true' || spotlight === 'true';
      if (isCurated) {
        filter.is_published = true;
        filter.date = { $gte: new Date() };
      }

      // The home page rail scrolls, so it can carry more than a 4-up grid could.
      const limit = spotlight === 'true' ? 2 : featured === 'true' ? 12 : 500;

      // Curated lists prefer the events an admin flagged, but fall back to the
      // next upcoming ones so the home page is never empty on a fresh install
      // or before anyone has curated anything.
      if (isCurated) {
        const flag = spotlight === 'true' ? 'is_spotlight' : 'is_featured';
        const curated = await Event.find({ ...filter, [flag]: true })
          .sort({ date: 1 })
          .limit(limit)
          .lean();
        if (curated.length > 0) {
          setPublicCache(res, 30);
          return res.status(200).json(await attachSeatCounts(withIds(curated)));
        }
      }

      const rawEvents = await Event.find(filter).sort({ date: 1 }).limit(limit).lean();
      // The admin dashboard re-fetches right after generating seats and must
      // never be served the 60s-old browser copy — the HTTP cache keys on the
      // URL alone, so the Authorization header wouldn't bypass it.
      if (isAdmin || fresh === 'true') setNoCache(res);
      else setPublicCache(res, 30);
      return res.status(200).json(await attachSeatCounts(withIds(rawEvents)));
    }

    // POST /api/events  – create event (admin only)
    if (req.method === 'POST') {
      const admin = await requireAdmin(req);
      const event = await Event.create({ ...pickEventFields(req.body, false), created_by: admin.userId });
      return res.status(201).json(event);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(res, err, '[api/events]');
  }
}
