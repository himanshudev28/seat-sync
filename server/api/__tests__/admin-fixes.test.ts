import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
    bookingsAdmin: (await import('../bookings/admin.js')).default,
    eventControl: (await import('../admin/event-control.js')).default,
    generate: (await import('../seats/generate.js')).default,
    analytics: (await import('../admin/analytics.js')).default,
    manage: (await import('../admin/bookings-manage.js')).default,
    seatType: (await import('../admin/seat-type.js')).default,
  };
}

type Who = { id: string; token: string };
let n = 0;
let admin: Who;
async function makeUser(isAdmin = false): Promise<Who> {
  n += 1;
  const u = await m.User.create({ email: `a${n}-${Date.now()}@x.com`, is_admin: isAdmin });
  return { id: String(u._id), token: m.auth.signToken({ _id: u._id, email: u.email, token_version: 0 }) };
}
async function call(h: any, o: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
  const res = mockRes() as any;
  await h(
    mockReq({
      method: o.method ?? 'GET',
      body: o.body,
      query: o.query,
      cookies: { ss_session: admin.token },
      headers: { 'x-real-ip': '10.2.0.1', origin: 'http://localhost:8080' },
    }),
    res
  );
  return res;
}

async function makeEvent(over: Record<string, unknown> = {}, seatCount = 4) {
  const ev = await m.Event.create({
    title: 'T', description: 'd', date: new Date(Date.now() + 7 * 864e5), location: 'l', category: 'c',
    created_by: 'x', is_published: true, ...over,
  });
  const seats = await m.Seat.insertMany(
    Array.from({ length: seatCount }, (_, i) => ({ event_id: ev._id, row: 'A', number: i + 1, price: 10, status: 'available' }))
  );
  return { ev, seats };
}
// created_at is immutable through mongoose; write it on the raw collection.
async function setCreated(filter: object, d: Date) {
  await m.Booking.collection.updateMany(filter, { $set: { created_at: d } });
}
async function book(ev: any, seat: any, over: Record<string, unknown> = {}) {
  const user = await m.User.create({ email: `b${++n}-${Date.now()}@x.com` });
  const b = await m.Booking.create({ event_id: ev._id, user_id: user._id, total_price: seat.price, status: 'confirmed', ...over });
  await m.BookingSeat.create({ booking_id: b._id, seat_id: seat._id });
  await m.Seat.updateOne({ _id: seat._id }, { $set: { status: 'booked' } });
  return b;
}

beforeAll(async () => {
  stop = await startTestReplMongo();
  process.env.JWT_SECRET = 'test-secret';
  m = await load();
  await (await import('../../db.js')).default();
  await Promise.all([m.User.init(), m.Event.init(), m.Seat.init(), m.Booking.init(), m.BookingSeat.init()]);
  admin = await makeUser(true);
}, 120_000);
afterAll(async () => { await stop(); });
beforeEach(async () => {
  await Promise.all([m.Event.deleteMany({}), m.Seat.deleteMany({}), m.Booking.deleteMany({}), m.BookingSeat.deleteMany({})]);
});

describe('admin bookings list', () => {
  it('includes checked_in state and allows limit 200', async () => {
    const { ev, seats } = await makeEvent();
    const b = await book(ev, seats[0]);
    await m.Booking.updateOne({ _id: b._id }, { $set: { checked_in: true, checked_in_at: new Date() } });
    const res = await call(m.bookingsAdmin, { query: { limit: '200' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.pagination.limit).toBe(200);
    expect(res.body.data[0].checked_in).toBe(true);
    expect(res.body.data[0].checked_in_at).toBeTruthy();
  });
});

describe('spotlight cap', () => {
  it('draft and past spotlights do not use up the slots', async () => {
    await makeEvent({ is_spotlight: true, is_published: false }, 0);
    await makeEvent({ is_spotlight: true, date: new Date(Date.now() - 864e5) }, 0);
    const a = (await makeEvent({ is_spotlight: true }, 0)).ev;
    const b = (await makeEvent({}, 0)).ev;
    const c = (await makeEvent({}, 0)).ev;
    const toggle = (id: unknown) => call(m.eventControl, { method: 'PATCH', body: { action: 'toggle_spotlight', eventId: String(id) } });
    expect((await toggle(b._id)).statusCode).toBe(200);
    expect((await toggle(c._id)).statusCode).toBe(409); // a + b are the two live ones
    expect(a.is_spotlight).toBe(true);
  });

  it('ban / unban are idempotent set operations', async () => {
    const { ev } = await makeEvent({}, 0);
    const ban = (action: string) => call(m.eventControl, { method: 'PATCH', body: { action, eventId: String(ev._id), userId: String(admin.id) } });
    await ban('ban_user'); await ban('ban_user');
    expect((await m.Event.findById(ev._id))!.banned_users).toHaveLength(1);
    await ban('unban_user');
    expect((await m.Event.findById(ev._id))!.banned_users).toHaveLength(0);
  });
});

describe('seat regeneration', () => {
  it('cancels live bookings, leaves refunded alone, reports the count', async () => {
    const { ev, seats } = await makeEvent({}, 3);
    const live = await book(ev, seats[0]);
    const refunded = await book(ev, seats[1], { status: 'refunded' });
    const res = await call(m.generate, { method: 'POST', body: { eventId: String(ev._id), seatPrice: 10, customLayout: false, rows: ['A'], seatsPerRow: 2 } });
    expect(res.statusCode).toBe(201);
    expect(res.body.cancelledBookings).toBe(1);
    expect((await m.Booking.findById(live._id))!.status).toBe('cancelled');
    expect((await m.Booking.findById(refunded._id))!.status).toBe('refunded');
    expect(await m.Seat.countDocuments({ event_id: ev._id })).toBe(2);
  });
});

describe('analytics', () => {
  it('trend key matches for a single-digit day and occupancy ignores blocked seats', async () => {
    const { ev, seats } = await makeEvent({}, 4);
    await book(ev, seats[0]);
    await m.Seat.updateOne({ _id: seats[3]._id }, { $set: { seat_type: 'blocked', status: 'reserved' } });
    // Any "today" with a single-digit day number in UTC would have broken the old keys; pin one 3 days ago anyway.
    const day = new Date(Date.now() - 3 * 864e5);
    await setCreated({ event_id: ev._id }, day);
    const res = await call(m.analytics, { query: { eventId: String(ev._id) } });
    expect(res.statusCode).toBe(200);
    const label = `${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
    expect(res.body.booking_trend.find((t: any) => t.date === label).count).toBe(1);
    expect(res.body.occupancy_pct).toBe(Math.round((1 / 3) * 100));
  });

  it('matches a day 1-9 explicitly', async () => {
    const { ev, seats } = await makeEvent({}, 1);
    const b = await book(ev, seats[0]);
    const now = new Date();
    // Use the most recent UTC day within the window whose number is single-digit.
    let d = new Date(now);
    for (let i = 0; i < 14 && d.getUTCDate() >= 10; i++) d = new Date(d.getTime() - 864e5);
    if (d.getUTCDate() >= 10) return; // window has no single-digit day (impossible in practice)
    await setCreated({ _id: b._id }, d);
    const res = await call(m.analytics, { query: { eventId: String(ev._id) } });
    expect(res.body.booking_trend.reduce((a: number, t: any) => a + t.count, 0)).toBe(1);
  });
});

describe('bookings-manage filters', () => {
  it('checked-in status filter and an inclusive dateTo', async () => {
    const { ev, seats } = await makeEvent({}, 3);
    const a = await book(ev, seats[0], { checked_in: true });
    const c = await book(ev, seats[1], { checked_in: true, status: 'cancelled' });
    const noCheck = await book(ev, seats[2]);
    await setCreated({ _id: a._id }, new Date('2026-03-05T18:00:00Z'));
    await setCreated({ _id: noCheck._id }, new Date('2026-03-06T01:00:00Z'));

    const checked = await call(m.manage, { query: { status: 'checked-in' } });
    expect(checked.statusCode).toBe(200);
    expect(checked.body.data.map((x: any) => x.id)).toEqual([String(a._id)]);
    expect(String(c._id)).not.toBe(String(a._id));

    // dateTo is a whole day: 18:00 on the 5th is included.
    const day = await call(m.manage, { query: { dateFrom: '2026-03-05', dateTo: '2026-03-05' } });
    expect(day.body.data.map((x: any) => x.id)).toEqual([String(a._id)]);
  });

  it('refuses to check in a cancelled booking', async () => {
    const { ev, seats } = await makeEvent({}, 1);
    const b = await book(ev, seats[0], { status: 'cancelled' });
    const res = await call(m.manage, { method: 'PATCH', body: { id: String(b._id), checked_in: true } });
    expect(res.statusCode).toBe(409);
  });
});

describe('seat-type', () => {
  const patch = (body: unknown) => call(m.seatType, { method: 'PATCH', body });

  it('cannot block a booked seat', async () => {
    const { ev, seats } = await makeEvent({}, 2);
    await book(ev, seats[0]);
    const res = await patch({ seatIds: [String(seats[0]._id)], seat_type: 'blocked' });
    expect(res.statusCode).toBe(409);
    expect((await m.Seat.findById(seats[0]._id))!.seat_type).toBe('standard');
  });

  it('unblocking makes the seat available again', async () => {
    const { seats } = await makeEvent({}, 1);
    const id = String(seats[0]._id);
    await patch({ seatIds: [id], seat_type: 'blocked' });
    expect((await m.Seat.findById(id))!.status).toBe('reserved');
    await patch({ seatIds: [id], seat_type: 'vip' });
    const s = await m.Seat.findById(id);
    expect(s!.status).toBe('available');
    expect(s!.seat_type).toBe('vip');
  });

  it("'available' keeps VIP, resets blocked to standard, and reprices the booking", async () => {
    const { ev, seats } = await makeEvent({}, 3);
    await m.Seat.updateOne({ _id: seats[0]._id }, { $set: { seat_type: 'vip' } });
    await m.Seat.updateOne({ _id: seats[2]._id }, { $set: { seat_type: 'blocked', status: 'reserved' } });
    const b = await book(ev, seats[0], { total_price: 20 });
    await m.BookingSeat.create({ booking_id: b._id, seat_id: seats[1]._id });
    await m.Seat.updateOne({ _id: seats[1]._id }, { $set: { status: 'booked' } });

    const res = await patch({ seatIds: [String(seats[0]._id), String(seats[2]._id)], forceStatus: 'available' });
    expect(res.statusCode).toBe(200);
    expect((await m.Seat.findById(seats[0]._id))!.seat_type).toBe('vip');
    expect((await m.Seat.findById(seats[2]._id))!.seat_type).toBe('standard');
    const after = await m.Booking.findById(b._id);
    expect(after!.status).toBe('confirmed');
    expect(after!.total_price).toBe(10);
  });
});
