/**
 * Which scanned QR codes are SeatSync tickets. A ticket QR is `<origin>/validate/<key>`, where the key
 * is the booking's ticket token (22 url-safe base64 characters, what new tickets carry) or, for
 * tickets issued before tokens existed, the 24-hex booking id. The server accepts both
 * (server/api/validate/[bookingId].ts).
 * Allowed origins: the site the scanner runs on, plus a comma-separated
 * `VITE_TICKET_ORIGINS` (e.g. the production domain while testing on a preview).
 */

const BOOKING_ID = /^[a-f0-9]{24}$/i;
const TICKET_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** The production site, where QR links point from any deployed host. */
export const TICKET_PROD_ORIGIN = "https://seat-sync-five.vercel.app";

export function allowedTicketOrigins(): string[] {
  const extra = String(import.meta.env.VITE_TICKET_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const here = typeof window !== "undefined" ? [window.location.origin] : [];
  return Array.from(new Set([...here, ...extra]));
}

/**
 * The URL a ticket's QR code encodes. Local development points at the dev server; every other
 * host points at production. `key` is the ticket token, or the booking id for old bookings.
 */
export function ticketQrUrl(key: string, hostname: string = typeof window !== "undefined" ? window.location.hostname : ""): string {
  const base = hostname !== "localhost" ? TICKET_PROD_ORIGIN : "http://localhost:8080";
  return `${base}/validate/${encodeURIComponent(key)}`;
}

/**
 * Parsed ticket link, or null when the text is not a SeatSync ticket from an allowed origin.
 * `bookingId` is the key from the link: a ticket token or a booking id.
 */
export function parseTicketUrl(
  text: string,
  origins: string[] = allowedTicketOrigins(),
): { url: URL; bookingId: string; sameOrigin: boolean } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!origins.includes(url.origin)) return null;
  const m = url.pathname.match(/^\/validate\/([^/]+)\/?$/);
  if (!m) return null;
  let key: string;
  try {
    key = decodeURIComponent(m[1]);
  } catch {
    return null; // malformed %-escape
  }
  if (!BOOKING_ID.test(key) && !TICKET_TOKEN.test(key)) return null;
  const sameOrigin = typeof window !== "undefined" && url.origin === window.location.origin;
  return { url, bookingId: key, sameOrigin };
}
