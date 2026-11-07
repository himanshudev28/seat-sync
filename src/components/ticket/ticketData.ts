import { compareRows } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** Start time in the viewer's time zone. Events store one date-time, not a separate time. */
export function timeOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

export type TicketSeat = { row: string; number: number; type?: string | null };

/** What an admin chose to print on this event's tickets (Admin → event → Ticket). */
export type TicketSettings = {
  issuer: string | null;
  show_holder: boolean;
  show_student_id: boolean;
  show_course: boolean;
  student_id_label: string;
  course_label: string;
  note: string | null;
};

/** Events saved before ticket settings existed print exactly what tickets always printed. */
export const DEFAULT_TICKET_SETTINGS: TicketSettings = {
  issuer: "INVERTIS UNIVERSITY",
  show_holder: true,
  show_student_id: true,
  show_course: true,
  student_id_label: "Student ID",
  course_label: "Course",
  note: null,
};

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- event JSON from the API */
export function ticketSettingsOf(event: any): TicketSettings {
  const s = event?.ticket_settings;
  if (!s || typeof s !== "object") return DEFAULT_TICKET_SETTINGS;
  const flag = (v: unknown) => (typeof v === "boolean" ? v : true);
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    // Once an admin has saved settings, an empty issuer means "print none".
    issuer: text(s.issuer),
    show_holder: flag(s.show_holder),
    show_student_id: flag(s.show_student_id),
    show_course: flag(s.show_course),
    student_id_label: text(s.student_id_label) ?? "Student ID",
    course_label: text(s.course_label) ?? "Course",
    note: text(s.note),
  };
}

/** Everything printed on a ticket. Built from GET /api/bookings/:id by toTicketData. */
export type TicketData = {
  bookingId: string;
  /** Short reference printed on the ticket (not a secret: the QR's token is). */
  ref: string;
  status: string;
  checkedIn: boolean;
  title: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  imageUrl: string | null;
  isFree: boolean;
  total: number;
  seats: TicketSeat[];
  bookedAt: string;
  /** Empty when the admin turned the field off for this event. */
  holder: string;
  studentId: string;
  course: string;
  issuer: string;
  studentIdLabel: string;
  courseLabel: string;
  note: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- the booking API is untyped JSON */
export function toTicketData(
  booking: any,
  person: { holder: string; studentId: string; course: string },
): TicketData {
  const event = booking?.event ?? booking?.event_id ?? {};
  const settings = ticketSettingsOf(event);
  const id = String(booking?._id ?? booking?.id ?? "");
  const seats: TicketSeat[] = (booking?.booking_seats ?? [])
    .map((bs: any) => bs?.seat)
    .filter(Boolean)
    .map((s: any) => ({ row: String(s.row ?? ""), number: Number(s.number ?? 0), type: s.seat_type ?? null }))
    .sort((a: TicketSeat, b: TicketSeat) => compareRows(a.row, b.row) || a.number - b.number);
  return {
    bookingId: id,
    ref: id.slice(-8).toUpperCase(),
    status: String(booking?.status ?? "confirmed"),
    checkedIn: !!booking?.checked_in,
    title: event.title ?? "Event",
    category: event.category ?? "",
    date: event.date ?? "",
    time: event.time || timeOf(event.date),
    venue: event.location ?? "",
    imageUrl: event.image_url ?? null,
    isFree: !!event.is_free,
    total: Number(booking?.total_price ?? 0),
    seats,
    bookedAt: booking?.created_at ?? "",
    holder: settings.show_holder ? person.holder : "",
    studentId: settings.show_student_id ? person.studentId : "",
    course: settings.show_course ? person.course : "",
    issuer: settings.issuer ?? "",
    studentIdLabel: settings.student_id_label,
    courseLabel: settings.course_label,
    note: settings.note ?? "",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Cancelled and refunded tickets are void: stamped, and they won't scan. */
export const isVoid = (t: TicketData) => t.status === "cancelled" || t.status === "refunded";

/** The pill on the ticket: how many people it lets in. */
export const admitLabel = (t: TicketData) => (isVoid(t) ? "NO ENTRY" : `ADMIT ${Math.max(t.seats.length, 1)}`);
