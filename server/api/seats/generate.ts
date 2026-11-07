import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import dbConnect from '../../db.js';
import { tierPrice } from '../../seatPricing.js';
import Booking from '../../models/Booking.js';
import BookingSeat from '../../models/BookingSeat.js';
import Event from '../../models/Event.js';
import Seat from '../../models/Seat.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';
import { objectId } from '../_utils/validate.js';

function generateRowLetters(count: number): string[] {
  const letters: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < 26) {
      letters.push(String.fromCharCode(65 + i));
    } else {
      const first = String.fromCharCode(65 + Math.floor((i - 26) / 26));
      const second = String.fromCharCode(65 + ((i - 26) % 26));
      letters.push(first + second);
    }
  }
  return letters;
}

/**
 * The counts arrive as JSON from a number input, so they can be strings,
 * floats, or NaN. Coerce once — `for (col = 1; col <= "15.5"; col++)` silently
 * produced a grid that didn't match the one the admin asked for.
 */
function toCount(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export interface LayoutRequest {
  customLayout?: boolean;
  rows?: string[];
  seatsPerRow?: unknown;
  numberOfRows?: unknown;
  numberOfColumns?: unknown;
}

export interface SeatDraft {
  row: string;
  number: number;
  price: number;
}

/**
 * Pure layout builder — the exact grid that gets written to the seats
 * collection, with no database involved so it can be reasoned about (and
 * tested) on its own.
 */
export function buildSeatLayout(
  input: LayoutRequest,
  basePrice: number
): { seats: SeatDraft[]; rows: string[]; columns: number } {
  const {
    customLayout = true,
    rows,
    seatsPerRow,
    numberOfRows,
    numberOfColumns,
  } = input;

  const seats: SeatDraft[] = [];

  if (customLayout) {
    const rowLetters = generateRowLetters(toCount(numberOfRows, 15, 3, 260));
    const columns = toCount(numberOfColumns, 15, 1, 100);

    // Ceil, not floor: the seat map splits rows with Math.ceil(rows / 3), so
    // flooring here priced rows into a tier that sat under a different section
    // heading on screen (with 10 rows, row D showed under "Front" but was
    // charged the middle-tier price).
    const sectionSize = Math.ceil(rowLetters.length / 3);
    // Cinema pricing: front (nearest the screen) is cheapest, back costs more, balcony most.
    const tiers: Array<[string[], number]> = [
      [rowLetters.slice(0, sectionSize), tierPrice(basePrice, 0)],
      [rowLetters.slice(sectionSize, sectionSize * 2), tierPrice(basePrice, 1)],
      [rowLetters.slice(sectionSize * 2), tierPrice(basePrice, 2)],
    ];

    for (const [tierRows, price] of tiers) {
      for (const row of tierRows) {
        for (let col = 1; col <= columns; col++) {
          seats.push({ row, number: col, price });
        }
      }
    }
    return { seats, rows: rowLetters, columns };
  }

  // Duplicate row letters would collide with the unique
  // {event_id, row, number} index and abort the whole insert.
  const rowLetters = Array.from(
    new Set((rows ?? ['A', 'B', 'C']).map((r) => String(r).trim().toUpperCase()).filter(Boolean))
  );
  const columns = toCount(seatsPerRow, 15, 1, 100);
  for (const row of rowLetters) {
    for (let number = 1; number <= columns; number++) {
      seats.push({ row, number, price: basePrice });
    }
  }
  return { seats, rows: rowLetters, columns };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
    await dbConnect();

    const { eventId, seatPrice, ...layoutInput } = req.body as LayoutRequest & {
      eventId: string;
      seatPrice: string | number;
    };

    if (!eventId || seatPrice === undefined) {
      return res.status(400).json({ error: 'eventId and seatPrice are required' });
    }

    const basePrice = parseFloat(String(seatPrice));
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return res.status(400).json({ error: 'seatPrice must be a non-negative number' });
    }

    const layout = buildSeatLayout(layoutInput, basePrice);
    if (layout.seats.length === 0) {
      return res.status(400).json({ error: 'The requested layout has no seats' });
    }

    objectId(eventId);

    // Make sure the event actually exists before we delete/cancel anything or
    // insert seats — a stale id would otherwise create orphaned seats.
    const eventExists = await Event.exists({ _id: eventId });
    if (!eventExists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Regenerating seats invalidates any bookings tied to them: cancel the live
    // ones and drop their seat links. One transaction so a failed insert can't
    // leave the event with no seats and every booking cancelled. Refunded and
    // already-cancelled bookings are history and stay untouched.
    const session = await mongoose.startSession();
    try {
      let count = 0;
      let cancelledBookings = 0;
      await session.withTransaction(async () => {
        const live = await Booking.find({ event_id: eventId, status: { $in: ['confirmed', 'pending'] } })
          .select('_id').session(session).lean();
        const bookingIds = live.map((b) => b._id);
        if (bookingIds.length > 0) {
          await BookingSeat.deleteMany({ booking_id: { $in: bookingIds } }, { session });
          const r = await Booking.updateMany(
            { _id: { $in: bookingIds } },
            { $set: { status: 'cancelled' } },
            { session }
          );
          cancelledBookings = r.modifiedCount;
        }
        await Seat.deleteMany({ event_id: eventId }, { session });
        const created = await Seat.insertMany(
          layout.seats.map((s) => ({ ...s, event_id: eventId, status: 'available' })),
          { session }
        );
        count = created.length;
      });
      // Echo the layout back so the admin UI can report what was actually
      // written rather than what it hoped for.
      return res.status(201).json({
        count,
        rows: layout.rows.length,
        columns: layout.columns,
        cancelledBookings,
      });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    return handleApiError(res, err, '[api/seats/generate]');
  }
}
