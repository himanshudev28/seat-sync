/**
 * Which scanned QR codes are SeatSync tickets. A ticket QR is `<origin>/validate/<bookingId>`.
 * Allowed origins: the site the scanner runs on, plus a comma-separated
 * `VITE_TICKET_ORIGINS` (e.g. the production domain while testing on a preview).
 */

const ID = /^[a-f0-9]{24}$/i;

export function allowedTicketOrigins(): string[] {
  const extra = String(import.meta.env.VITE_TICKET_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const here = typeof window !== "undefined" ? [window.location.origin] : [];
  return Array.from(new Set([...here, ...extra]));
}

/** Parsed ticket link, or null when the text is not a SeatSync ticket from an allowed origin. */
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
  if (!m || !ID.test(m[1])) return null;
  const sameOrigin = typeof window !== "undefined" && url.origin === window.location.origin;
  return { url, bookingId: m[1], sameOrigin };
}
