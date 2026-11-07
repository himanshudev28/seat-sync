import { badRequest } from '../_utils/http.js';
import { bool, clampInt, httpsUrl, str } from '../_utils/validate.js';

/**
 * Whitelist of event fields an admin may write. Anything else in the body (created_by,
 * banned_users, _id, ...) is ignored. With partial=true only the supplied fields are returned.
 */
export function pickEventFields(body: unknown, partial: boolean): Record<string, unknown> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => b[k] !== undefined;
  const need = (k: string) => { if (!partial && !has(k)) throw badRequest(`${k} is required`); return has(k); };

  if (need('title')) out.title = str(b.title, { min: 1, max: 200 });
  if (need('description')) out.description = str(b.description, { min: 1, max: 5000 });
  if (need('location')) out.location = str(b.location, { min: 1, max: 300 });
  if (need('category')) out.category = str(b.category, { min: 1, max: 100 });
  if (need('date')) {
    const d = new Date(String(b.date));
    if (Number.isNaN(d.getTime())) throw badRequest('Invalid date');
    out.date = d;
  }
  if (has('price')) {
    const n = Number(b.price);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw badRequest('Invalid price');
    out.price = n;
  }
  if (has('image_url')) out.image_url = b.image_url === null || b.image_url === '' ? null : httpsUrl(b.image_url, { max: 2000 });
  for (const k of ['is_free', 'is_published', 'is_featured', 'is_spotlight', 'is_bookings_open']) {
    if (has(k)) out[k] = bool(b[k]);
  }
  if (has('max_seats_per_user')) out.max_seats_per_user = clampInt(b.max_seats_per_user, 10, 1, 100);
  if (has('max_tickets_per_event')) {
    out.max_tickets_per_event = b.max_tickets_per_event === null ? null : clampInt(b.max_tickets_per_event, 0, 0, 1_000_000);
  }
  if (has('ticket_settings')) out.ticket_settings = pickTicketSettings(b.ticket_settings);
  return out;
}

/** Ticket layout chosen by the admin (what the printed ticket shows). Always stored whole. */
export function pickTicketSettings(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw badRequest('Invalid ticket settings');
  const t = v as Record<string, unknown>;
  const text = (x: unknown, max: number) => (x === null || x === undefined || x === '' ? null : str(x, { max }) || null);
  const label = (x: unknown, fallback: string) => text(x, 40) ?? fallback;
  return {
    issuer: text(t.issuer, 80),
    show_holder: t.show_holder === undefined ? true : bool(t.show_holder),
    show_student_id: t.show_student_id === undefined ? true : bool(t.show_student_id),
    show_course: t.show_course === undefined ? true : bool(t.show_course),
    student_id_label: label(t.student_id_label, 'Student ID'),
    course_label: label(t.course_label, 'Course'),
    note: text(t.note, 160),
  };
}
