import { useEffect, useSyncExternalStore } from "react";
import { matchPath, useLocation } from "react-router-dom";

export const SITE_NAME = "SeatSync";
/** The home page keeps the full marketing title. */
export const HOME_TITLE = "SeatSync — Book Events You'll Love";

/** Default title per route, used when the page doesn't set one with usePageTitle. First match wins. */
const ROUTE_TITLES: [pattern: string, title: string][] = [
  ["/events/:id", "Event"],
  ["/events", "Events"],
  ["/auth/callback", "Signing in"],
  ["/auth", "Sign in"],
  ["/profile", "Profile"],
  ["/admin/bookings", "Bookings · Admin"],
  ["/admin-setup", "Admin setup"],
  ["/admin", "Admin"],
  ["/tickets", "My tickets"],
  ["/generate-ticket/:id", "Your ticket"],
  ["/scan", "Scan tickets"],
  ["/validate/:bookingId", "Validate ticket"],
];

/** `["Coldplay Live", "Seats"]` → "Coldplay Live · Seats · SeatSync"; nothing → the home title. */
export function formatTitle(parts: readonly (string | null | undefined)[]): string {
  const kept = parts.filter((p): p is string => Boolean(p && p.trim()));
  return kept.length ? [...kept, SITE_NAME].join(" · ") : HOME_TITLE;
}

export function routeTitle(pathname: string): string | undefined {
  if (pathname === "/") return undefined;
  const hit = ROUTE_TITLES.find(([pattern]) => matchPath(pattern, pathname));
  return hit ? hit[1] : "Page not found";
}

// Title parts set by the current page; null when the page sets none (the route default applies).
let pageParts: string[] | null = null;
const listeners = new Set<() => void>();
function setPageParts(next: string[] | null) {
  pageParts = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Sets the document title for the current page, e.g. `usePageTitle(event?.title)`. Empty parts are
 * skipped, so it's safe to call before data has loaded. Pages that don't call it get their route's
 * default from ROUTE_TITLES.
 */
export function usePageTitle(...parts: (string | null | undefined)[]): void {
  const key = parts.filter(Boolean).join("\u0000");
  useEffect(() => {
    setPageParts(key ? key.split("\u0000") : []);
    return () => setPageParts(null);
  }, [key]);
}

/** Keeps `document.title` in sync. Rendered once, inside the router. */
export function DocumentTitle(): null {
  const parts = useSyncExternalStore(subscribe, () => pageParts);
  const { pathname } = useLocation();
  const title = formatTitle(parts ?? [routeTitle(pathname)]);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
