/**
 * seed.ts – Populate the database with an admin user and sample events.
 *
 * Usage (from project root):
 *   npx ts-node --project tsconfig.server.json server/seed.ts
 *
 * Re-running is idempotent: existing admin / seeded events are deleted first.
 */

import 'dotenv/config';
import dbConnect from './db.js';
import User from './models/User.js';
import EventModel from './models/Event.js';
import SeatModel from './models/Seat.js';
import BookingModel from './models/Booking.js';
import { assertSafeSeedTarget } from './seedGuard.js';
import { tierPrice } from './seatPricing.js';

/**
 * Event dates are relative to "now" so a fresh seed is always bookable, and expressed as
 * India local time (IST = UTC+05:30) so "7 PM" shows as 7 PM, not 12:30 AM.
 */
function istDateFromNow(days: number, hour: number, minute: number): Date {
  const d = new Date(Date.now() + days * 86_400_000);
  // Midnight UTC of that calendar day, then the IST wall-clock time minus the 5h30 offset.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute) - 330 * 60_000);
}

async function seed() {
  assertSafeSeedTarget(process.env.MONGODB_URI);
  console.log('🌱  Connecting to MongoDB…');
  await dbConnect();
  console.log('✅  Connected.');

  // ── Wipe existing seed data ──────────────────────────────────────────────
  await BookingModel.deleteMany({});
  await SeatModel.deleteMany({});
  await EventModel.deleteMany({});
  await User.deleteMany({});
  console.log('🗑   Cleared existing collections.');

  // ── Admin user ────────────────────────────────────────────────────────────
  // Password is hashed automatically by the pre-save hook in User model
  const admin = await User.create({
    email: 'admin@example.com',
    password: 'admin123',
    first_name: 'Admin',
    last_name: 'User',
    is_admin: true,
  });
  console.log(`👤  Admin created: ${admin.email}  (password: admin123)`);

  // ── Regular test user ────────────────────────────────────────────────────
  const regularUser = await User.create({
    email: 'user@example.com',
    password: 'user1234',
    first_name: 'Test',
    last_name: 'User',
    is_admin: false,
  });
  console.log(`👤  User created:  ${regularUser.email}  (password: user1234)`);

  // ── Sample events ─────────────────────────────────────────────────────────
  const events = await EventModel.insertMany([
    {
      title: 'Summer Rock Concert',
      description:
        'An electrifying night of rock music featuring top local and national bands. ' +
        'Get ready for an unforgettable experience under the stars.',
      date: istDateFromNow(30, 19, 0),
      location: 'Riverside Amphitheatre, Mumbai',
      price: 1499,
      category: 'Concert',
      is_published: true,
      is_free: false,
      max_seats_per_user: 6,
      created_by: admin._id,
    },
    {
      title: 'Tech Summit 2026',
      description:
        'Join industry leaders for a full-day conference covering AI, Web3, ' +
        'and the future of software development. Workshops and networking included.',
      date: istDateFromNow(55, 9, 30),
      location: 'Convention Centre, Bangalore',
      price: 799,
      category: 'Conference',
      is_published: true,
      is_free: false,
      max_seats_per_user: 4,
      created_by: admin._id,
    },
    {
      title: 'Free Community Meetup',
      description:
        'A relaxed evening meetup for developers, designers, and product enthusiasts. ' +
        'Free drinks, lightning talks, and plenty of networking.',
      date: istDateFromNow(40, 18, 30),
      location: 'CoWork Hub, Delhi',
      price: 0,
      category: 'Meetup',
      is_published: true,
      is_free: true,
      max_seats_per_user: 10,
      created_by: admin._id,
    },
    {
      title: 'Championship Finals 2026',
      description:
        'The biggest sports event of the year. Watch the top teams battle for the championship ' +
        'trophy in an electrifying atmosphere.',
      date: istDateFromNow(75, 19, 30),
      location: 'National Stadium, Main Arena',
      price: 2499,
      category: 'Sports',
      image_url: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800',
      is_published: true,
      is_free: false,
      max_seats_per_user: 6,
      created_by: admin._id,
    },
    {
      title: 'Romeo & Juliet - Modern Adaptation',
      description:
        "A breathtaking modern retelling of Shakespeare's classic tragedy. " +
        'Featuring stunning visuals and an award-winning cast.',
      date: istDateFromNow(110, 20, 0),
      location: 'Grand Theater Hall',
      price: 999,
      category: 'Theater',
      image_url: 'https://images.unsplash.com/photo-1503095392235-fc1bc0d8c8f5?w=800',
      is_published: true,
      is_free: false,
      max_seats_per_user: 8,
      created_by: admin._id,
    },
  ]);
  console.log(`🎪  ${events.length} events created.`);

  // ── Generate seats for each event ─────────────────────────────────────────
  // Layout: 12 rows (A–L) × 20 cols
  // Cinema pricing (server/seatPricing.ts): front rows are cheapest.
  // Front 4 rows  (A–D): base
  // Middle 4 rows (E–H): base + step
  // Back 4 rows   (I–L): base + 2 × step
  const ROWS = 12;
  const COLS = 20;
  const SECTION = 4; // rows per tier

  let totalSeats = 0;

  for (const event of events) {
    const basePrice = event.is_free ? 0 : event.price;

    const rowLetters: string[] = [];
    for (let i = 0; i < ROWS; i++) {
      rowLetters.push(String.fromCharCode(65 + i)); // A–L
    }

    const frontRows  = rowLetters.slice(0, SECTION);             // A–D
    const middleRows = rowLetters.slice(SECTION, SECTION * 2);   // E–H
    const backRows   = rowLetters.slice(SECTION * 2);            // I–L

    const seats: {
      event_id: typeof event._id;
      row: string;
      number: number;
      price: number;
      status: 'available';
    }[] = [];

    for (const row of frontRows) {
      for (let col = 1; col <= COLS; col++) {
        seats.push({ event_id: event._id, row, number: col, price: tierPrice(basePrice, 0), status: 'available' });
      }
    }
    for (const row of middleRows) {
      for (let col = 1; col <= COLS; col++) {
        seats.push({ event_id: event._id, row, number: col, price: tierPrice(basePrice, 1), status: 'available' });
      }
    }
    for (const row of backRows) {
      for (let col = 1; col <= COLS; col++) {
        seats.push({ event_id: event._id, row, number: col, price: tierPrice(basePrice, 2), status: 'available' });
      }
    }

    await SeatModel.insertMany(seats);
    totalSeats += seats.length;
    console.log(`💺  ${seats.length} seats created for "${event.title}".`);
  }

  console.log(`\n🎉  Seeded ${events.length} events with ${totalSeats} total seats\n`);
  console.log('   Admin login  →  admin@example.com  /  admin123');
  console.log('   User login   →  user@example.com   /  user1234\n');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
