import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { startTestReplMongo } from '../../test/replMongo';
import { mockReq, mockRes } from '../../test/mockHttp';

let stop: () => Promise<void>;
let m: Awaited<ReturnType<typeof load>>;

async function load() {
  return {
    User: (await import('../../models/User.js')).default,
    Event: (await import('../../models/Event.js')).default,
    Seat: (await import('../../models/Seat.js')).default,
    Booking: (await import('../../models/Booking.js')).default,
    BookingSeat: (await import('../../models/BookingSeat.js')).default,
    auth: await import('../_utils/auth.js'),
    hold: (await import('../seats/hold.js')).default,
    confirm: (await import('../seats/confirm.js')).default,
    seatsGet: (await import('../seats.js')).default,
    bookings: (await import('../bookings.js')).default,
    cancel: (await import('../bookings/cancel.js')).default,
    validate: (await import('../validate/[bookingId].js')).default,
    events: (await import('../events.js')).default,
    eventById: (await import('../events/[id].js')).default,
    exportBookings: (await import('../bookings/export.js')).default,
    seatType: (await import('../admin/seat-type.js')).default,
  };
}

function withSend(res: ReturnType<typeof mockRes>) {
  (res as any).send = (b: unknown) => { (res as any).body = b; (res as any).ended = true; return res; };
  return res;
}

type Who = { id: string; token: string };
let n = 0;
async function user(admin = false): Promise<Who> {
  n += 1;
  const u = await m.User.create({ email: `u${n}-${Date.now()}@x.com`, is_admin: admin });
  return { id: String(u._id), token: m.auth.signToken({ _id: u._id, email: u.email, token_version: 0 }) };
}
async function call(h: any, who: Who | null, o: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
  const res = withSend(mockRes());
  await h(
    mockReq({
      method: o.method ?? 'POST',
      body: o.body,
      query: o.query,
      cookies: who ? { ss_session: who.token } : undefined,
      headers: { 'x-real-ip': `10.1.${n % 250}.${Math.floor(Math.random() * 250)}`, origin: 'http://localhost:8080' },
    }),
    res
  );
  return res as any;
}

async function makeEvent(over: Record<string, unknown> = {}, seatCount = 5) {
  const ev = await m.Event.create({
    title: '=cmd|evil', description: 'd', date: new Date(Date.now() + 7 * 864e5), location: 'l', category: 'c',
    created_by: 'x', is_published: true, max_seats_per_user: 3, ...over,
  });
  const seats = await m.Seat.insertMany(
    Array.from({ length: seatCount }, (_, i) => ({ event_id: ev._id, row: 'A', number: i + 1, price: 10, status: 'available' }))
  );
  return { ev, seats: seats.map((s) => String(s._id)) };
}

beforeAll(async () => {
  stop = await startTestReplMongo();
  process.env.JWT_SECRET = 'test-secret';
  m = await load();
  await (await import('../../db.js')).default();
  await Promise.all([m.User.init(), m.Event.init(), m.Seat.init(), m.Booking.init(), m.BookingSeat.init()]);
}, 120_000);
afterAll(async () => { await stop(); });
beforeEach(async () => {
  await Promise.all([m.Event.deleteMany({}), m.Seat.deleteMany({}), m.Booking.deleteMany({}), m.BookingSeat.deleteMany({})]);
});

describe('seat holds', () => {
  it('two users racing for the same seat: exactly one wins', async () => {
    const { ev, seats } = await makeEvent();
    const [a, b] = [await user(), await user()];
    const [ra, rb] = await Promise.all([
      call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[0]] } }),
      call(m.hold, b, { body: { eventId: String(ev._id), seatIds: [seats[0]] } }),
    ]);
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([200, 409]);
    const seat = await m.Seat.findById(seats[0]);
    expect(seat!.status).toBe('reserved');
    expect(seat!.heldBy).toBe(ra.statusCode === 200 ? a.id : b.id);
  });

  it('enforces the per-user cap and rolls back newly held seats', async () => {
    const { ev, seats } = await makeEvent({ max_seats_per_user: 2 });
    const a = await user();
    expect((await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[0], seats[1]] } })).statusCode).toBe(200);
    const over = await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[2]] } });
    expect(over.statusCode).toBe(409);
    expect((await m.Seat.findById(seats[2]))!.status).toBe('available');
    expect(await m.Seat.countDocuments({ heldBy: a.id })).toBe(2);
  });

  it('rejects more than 10 ids and a missing eventId', async () => {
    const { ev } = await makeEvent();
    const a = await user();
    const ids = Array.from({ length: 11 }, () => String(new Types.ObjectId()));
    expect((await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: ids } })).statusCode).toBe(400);
    expect((await call(m.hold, a, { body: { seatIds: ids.slice(0, 1) } })).statusCode).toBe(400);
  });

  it('rejects a seat from another event', async () => {
    const e1 = await makeEvent();
    const e2 = await makeEvent();
    const a = await user();
    const r = await call(m.hold, a, { body: { eventId: String(e1.ev._id), seatIds: [e2.seats[0]] } });
    expect(r.statusCode).toBe(400);
    expect((await m.Seat.findById(e2.seats[0]))!.status).toBe('available');
  });

  it('rejects a banned user, an unpublished event and closed bookings', async () => {
    const a = await user();
    const banned = await makeEvent({ banned_users: [a.id] });
    expect((await call(m.hold, a, { body: { eventId: String(banned.ev._id), seatIds: [banned.seats[0]] } })).statusCode).toBe(403);
    const draft = await makeEvent({ is_published: false });
    expect((await call(m.hold, a, { body: { eventId: String(draft.ev._id), seatIds: [draft.seats[0]] } })).statusCode).toBe(403);
    const closed = await makeEvent({ is_bookings_open: false });
    expect((await call(m.hold, a, { body: { eventId: String(closed.ev._id), seatIds: [closed.seats[0]] } })).statusCode).toBe(403);
  });

  it('refreshing a hold cannot extend it past 15 minutes', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    expect((await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[0]] } })).statusCode).toBe(200);
    // Pretend the hold chain began 14 minutes ago and is about to lapse.
    await m.Seat.updateOne({ _id: seats[0] }, { $set: { heldSince: new Date(Date.now() - 14 * 60_000), heldUntil: new Date(Date.now() + 60_000) } });
    expect((await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[0]] } })).statusCode).toBe(200);
    const s = await m.Seat.findById(seats[0]);
    expect(s!.heldUntil!.getTime()).toBeLessThanOrEqual(s!.heldSince!.getTime() + 15 * 60_000 + 1000);
  });

  it('seat map GET does not write', async () => {
    const { ev, seats } = await makeEvent();
    await m.Seat.updateOne({ _id: seats[0] }, { $set: { status: 'reserved', heldBy: 'x', heldUntil: new Date(Date.now() - 1000) } });
    const r = await call(m.seatsGet, null, { method: 'GET', query: { eventId: String(ev._id) } });
    expect(r.body.find((s: any) => String(s._id) === seats[0]).status).toBe('available');
    expect((await m.Seat.findById(seats[0]))!.status).toBe('reserved');
    expect(r.body[0].heldBy).toBeUndefined();
  });
});

describe('seat selection feedback', () => {
  it('explains seat-count and id problems in plain words', async () => {
    const { ev } = await makeEvent();
    const a = await user();
    const eventId = String(ev._id);
    const eleven = Array.from({ length: 11 }, () => String(new Types.ObjectId()));
    const tooMany = await call(m.hold, a, { body: { eventId, seatIds: eleven } });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.body.error).toBe('You can select at most 10 seats at a time');
    const none = await call(m.hold, a, { body: { eventId, seatIds: [] } });
    expect(none.body.error).toBe('Select at least one seat');
    const bad = await call(m.hold, a, { body: { eventId, seatIds: ['not-an-id'] } });
    expect(bad.body.error).toBe('Invalid seat id');
    const dup = String(new Types.ObjectId());
    const twice = await call(m.hold, a, { body: { eventId, seatIds: [dup, dup] } });
    expect(twice.body.error).toBe('The same seat was selected twice');
    const booking = await call(m.bookings, a, { body: { eventId, seatIds: eleven } });
    expect(booking.body.error).toBe('You can select at most 10 seats at a time');
  });

  it('seat map marks the caller\'s own held and booked seats, and nothing for others or anonymous', async () => {
    const { ev, seats } = await makeEvent({ max_seats_per_user: 5 });
    const a = await user();
    const b = await user();
    const eventId = String(ev._id);
    // a books seat 0, then holds seat 1
    expect((await call(m.hold, a, { body: { eventId, seatIds: [seats[0]] } })).statusCode).toBe(200);
    expect((await call(m.bookings, a, { body: { eventId, seatIds: [seats[0]] } })).statusCode).toBe(201);
    expect((await call(m.hold, a, { body: { eventId, seatIds: [seats[1]] } })).statusCode).toBe(200);

    const mine = await call(m.seatsGet, a, { method: 'GET', query: { eventId } });
    const byId = (r: any, id: string) => r.body.find((x: any) => String(x._id) === id);
    expect(byId(mine, seats[0])).toMatchObject({ booked_by_me: true, held_by_me: false });
    expect(byId(mine, seats[1])).toMatchObject({ held_by_me: true, booked_by_me: false });
    expect(byId(mine, seats[2])).toMatchObject({ held_by_me: false, booked_by_me: false });
    expect(mine.headers?.['cache-control'] ?? mine.getHeader?.('Cache-Control')).toBe('private, no-store');

    const other = await call(m.seatsGet, b, { method: 'GET', query: { eventId } });
    expect(byId(other, seats[0])).toMatchObject({ booked_by_me: false, held_by_me: false });
    expect(byId(other, seats[1])).toMatchObject({ booked_by_me: false, held_by_me: false });

    const anon = await call(m.seatsGet, null, { method: 'GET', query: { eventId } });
    expect(byId(anon, seats[0]).booked_by_me).toBeUndefined();
    expect(byId(anon, seats[0]).heldBy).toBeUndefined();
  });
});

describe('wheelchair seats', () => {
  it('an admin can mark seats as wheelchair, they stay bookable, and bad types are refused', async () => {
    const { ev, seats } = await makeEvent();
    const admin = await user(true);
    const a = await user();
    const ok = await call(m.seatType, admin, { method: 'PATCH', body: { seatIds: [seats[0]], seat_type: 'wheelchair' } });
    expect(ok.statusCode).toBe(200);
    expect((await m.Seat.findById(seats[0]))!.seat_type).toBe('wheelchair');
    const bad = await call(m.seatType, admin, { method: 'PATCH', body: { seatIds: [seats[1]], seat_type: 'throne' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toContain('wheelchair');
    // Validation on the model itself, too.
    await expect(m.Seat.create({ event_id: ev._id, row: 'Z', number: 1, price: 10, seat_type: 'wheelchair' })).resolves.toBeTruthy();
    // A wheelchair seat is booked like any other seat.
    const eventId = String(ev._id);
    expect((await call(m.hold, a, { body: { eventId, seatIds: [seats[0]] } })).statusCode).toBe(200);
    expect((await call(m.bookings, a, { body: { eventId, seatIds: [seats[0]] } })).statusCode).toBe(201);
  });
});

describe('confirm', () => {
  it('is gone (410) and books nothing', async () => {
    const { seats } = await makeEvent();
    const a = await user();
    const r = await call(m.confirm, a, { body: { seatIds: [seats[0]] } });
    expect(r.statusCode).toBe(410);
    expect((await m.Seat.findById(seats[0]))!.status).toBe('available');
  });
});

async function holdAndBook(who: Who, evId: string, seatIds: string[]) {
  const h = await call(m.hold, who, { body: { eventId: evId, seatIds } });
  expect(h.statusCode).toBe(200);
  return call(m.bookings, who, { body: { eventId: evId, seatIds } });
}

describe('bookings', () => {
  it('double submit produces exactly one booking', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    expect((await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[0]] } })).statusCode).toBe(200);
    const body = { eventId: String(ev._id), seatIds: [seats[0]] };
    const [r1, r2] = await Promise.all([call(m.bookings, a, { body }), call(m.bookings, a, { body })]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([201, 409]);
    expect(await m.Booking.countDocuments({})).toBe(1);
    expect(await m.BookingSeat.countDocuments({})).toBe(1);
    const b = await m.Booking.findOne({});
    expect(b!.ticket_token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('refuses a seat that belongs to another event', async () => {
    const e1 = await makeEvent();
    const e2 = await makeEvent();
    const a = await user();
    // Forge a hold on the other event's seat.
    await m.Seat.updateOne({ _id: e2.seats[0] }, { $set: { status: 'reserved', heldBy: a.id, heldUntil: new Date(Date.now() + 60_000) } });
    const r = await call(m.bookings, a, { body: { eventId: String(e1.ev._id), seatIds: [e2.seats[0]] } });
    expect(r.statusCode).toBe(409);
    expect(await m.Booking.countDocuments({})).toBe(0);
  });

  it('refuses a blocked seat', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    await m.Seat.updateOne({ _id: seats[0] }, { $set: { seat_type: 'blocked', status: 'reserved', heldBy: a.id, heldUntil: new Date(Date.now() + 60_000) } });
    expect((await call(m.bookings, a, { body: { eventId: String(ev._id), seatIds: [seats[0]] } })).statusCode).toBe(409);
  });

  it('cancel then re-book the same seat succeeds', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    const b = await holdAndBook(a, String(ev._id), [seats[0]]);
    expect(b.statusCode).toBe(201);
    const c = await call(m.cancel, a, { body: { bookingId: String(b.body._id) } });
    expect(c.statusCode).toBe(200);
    expect(await m.BookingSeat.countDocuments({})).toBe(0);
    expect((await m.Seat.findById(seats[0]))!.status).toBe('available');
    const again = await holdAndBook(await user(), String(ev._id), [seats[0]]);
    expect(again.statusCode).toBe(201);
  });

  it('cancel only works on your own confirmed booking, once', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    const b = await holdAndBook(a, String(ev._id), [seats[0]]);
    expect((await call(m.cancel, await user(), { body: { bookingId: String(b.body._id) } })).statusCode).toBe(404);
    expect((await call(m.cancel, a, { body: { bookingId: String(b.body._id) } })).statusCode).toBe(200);
    expect((await call(m.cancel, a, { body: { bookingId: String(b.body._id) } })).statusCode).toBe(400);
  });

  it('counts pending bookings toward the per-user cap', async () => {
    const { ev, seats } = await makeEvent({ max_seats_per_user: 2 });
    const a = await user();
    const first = await holdAndBook(a, String(ev._id), [seats[0], seats[1]]);
    expect(first.statusCode).toBe(201);
    await m.Booking.updateOne({ _id: first.body._id }, { $set: { status: 'pending' } });
    const h = await call(m.hold, a, { body: { eventId: String(ev._id), seatIds: [seats[2]] } });
    expect(h.statusCode).toBe(409);
  });

  it('GET /bookings?userId= cannot read another user (IDOR)', async () => {
    const { ev, seats } = await makeEvent();
    const victim = await user();
    const attacker = await user();
    const admin = await user(true);
    expect((await holdAndBook(victim, String(ev._id), [seats[0]])).statusCode).toBe(201);
    const stolen = await call(m.bookings, attacker, { method: 'GET', query: { userId: victim.id } });
    expect(stolen.statusCode).toBe(403);
    const own = await call(m.bookings, attacker, { method: 'GET' });
    expect(own.body).toEqual([]);
    const asAdmin = await call(m.bookings, admin, { method: 'GET', query: { userId: victim.id } });
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.body).toHaveLength(1);
  });
});

describe('ticket validation', () => {
  it('check-in needs an admin; a double POST is one CHECKED_IN then ALREADY_USED', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    const b = await holdAndBook(a, String(ev._id), [seats[0]]);
    const id = String(b.body._id);
    expect((await call(m.validate, null, { query: { bookingId: id } })).statusCode).toBe(401);
    expect((await call(m.validate, a, { query: { bookingId: id } })).statusCode).toBe(403);
    expect((await m.Booking.findById(id))!.checked_in).toBe(false);
    const admin = await user(true);
    const [r1, r2] = await Promise.all([
      call(m.validate, admin, { query: { bookingId: id }, body: { eventId: String(ev._id) } }),
      call(m.validate, admin, { query: { bookingId: id }, body: { eventId: String(ev._id) } }),
    ]);
    const results = [r1.body.result, r2.body.result].sort();
    expect(results).toEqual(['ALREADY_USED', 'CHECKED_IN']);
    expect(r1.statusCode).toBe(200);
    expect(String(r1.body.checkedInAt)).toBe(String(r2.body.checkedInAt));
    expect(r1.body.checkedInBy).toBe(admin.id);
    const third = await call(m.validate, admin, { query: { bookingId: id } });
    expect(third.body.result).toBe('ALREADY_USED');
  });

  it('works by ticket token; wrong eventId is 409 WRONG_EVENT; unknown is 404', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    const b = await holdAndBook(a, String(ev._id), [seats[0]]);
    const token = (await m.Booking.findById(b.body._id))!.ticket_token;
    const admin = await user(true);
    const wrong = await call(m.validate, admin, { query: { bookingId: token }, body: { eventId: String(new Types.ObjectId()) } });
    expect(wrong.statusCode).toBe(409);
    expect(wrong.body).toEqual({ result: 'WRONG_EVENT' });
    expect((await call(m.validate, admin, { query: { bookingId: token } })).body.result).toBe('CHECKED_IN');
    expect((await call(m.validate, admin, { query: { bookingId: String(new Types.ObjectId()) } })).statusCode).toBe(404);
  });

  it('a cancelled booking is NOT_CONFIRMED and cannot check in', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    const b = await holdAndBook(a, String(ev._id), [seats[0]]);
    await call(m.cancel, a, { body: { bookingId: String(b.body._id) } });
    const admin = await user(true);
    const r = await call(m.validate, admin, { query: { bookingId: String(b.body._id) } });
    expect(r.statusCode).toBe(409);
    expect(r.body).toEqual({ result: 'NOT_CONFIRMED', status: 'cancelled' });
    expect((await m.Booking.findById(b.body._id))!.checked_in).toBe(false);
  });

  it('public GET is read-only and returns only valid, status, checkedIn, checkedInAt', async () => {
    const { ev, seats } = await makeEvent();
    const a = await user();
    const b = await holdAndBook(a, String(ev._id), [seats[0]]);
    const before = JSON.stringify(await m.Booking.findById(b.body._id).lean());
    const r = await call(m.validate, null, { method: 'GET', query: { bookingId: String(b.body._id) } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ valid: true, status: 'confirmed', checkedIn: false, checkedInAt: null });
    expect(JSON.stringify(await m.Booking.findById(b.body._id).lean())).toBe(before);
    const none = await call(m.validate, null, { method: 'GET', query: { bookingId: 'nope' } });
    expect(none.statusCode).toBe(404);
    expect(none.body).toEqual({ valid: false });
  });
});

describe('CSV export', () => {
  it('neutralises formulas and sanitises the filename', async () => {
    const { ev, seats } = await makeEvent({ title: '=HYPERLINK("x")"; evil' });
    const a = await user();
    await holdAndBook(a, String(ev._id), [seats[0]]);
    const admin = await user(true);
    const r = await call(m.exportBookings, admin, { method: 'GET', query: { eventId: String(ev._id) } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(`"'=HYPERLINK(""x"")""; evil"`);
    expect(r.body).not.toMatch(/(^|,)"=/m);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="[A-Za-z0-9._-]+-bookings\.csv"$/);
  });
});

describe('events list', () => {
  it('shows only upcoming published events by default; past and drafts are admin-only', async () => {
    const day = 864e5;
    const mk = (title: string, offset: number, pub = true) =>
      m.Event.create({ title, description: 'd', date: new Date(Date.now() + offset), location: 'l', category: 'c', created_by: 'x', is_published: pub });
    await mk('future', 2 * day);
    await mk('recent', -3600_000); // started 1 h ago: still shown
    await mk('old', -2 * day);
    const draft = await mk('draft', 3 * day, false);
    const titles = (r: any) => r.body.map((e: any) => e.title);

    const pub = await call(m.events, null, { method: 'GET' });
    expect(titles(pub)).toEqual(['recent', 'future']);

    const nonAdmin = await user();
    expect((await call(m.events, nonAdmin, { method: 'GET', query: { include: 'past' } })).statusCode).toBe(403);
    expect((await call(m.events, null, { method: 'GET', query: { include: 'past' } })).statusCode).toBe(401);

    const admin = await user(true);
    const all = await call(m.events, admin, { method: 'GET', query: { include: 'past' } });
    expect(titles(all)).toEqual(['old', 'recent', 'future', 'draft']);

    expect((await call(m.eventById, null, { method: 'GET', query: { id: String(draft._id) } })).statusCode).toBe(404);
    const d = await call(m.eventById, admin, { method: 'GET', query: { id: String(draft._id) } });
    expect(d.statusCode).toBe(200);
    expect(d.headers['cache-control']).toBe('private, no-store');
  });
});
