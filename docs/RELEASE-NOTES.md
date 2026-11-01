# SeatSync — release notes

> Status: release candidate, **not committed or pushed**. Commit and push only on the owner's go.
> **Final check (2026-11-01 23:28) on exactly the release tree** (the excluded seat-map / a11yAudit files
> moved aside): tsc app/server/test **0/0/0** · tests **148/148** (20 files) · lint **123 errors / 11
> warnings** (baseline 132/14; 122 are `no-explicit-any`, the 1 other is in the kept Supabase function) ·
> build OK · first-load JS **111.5 KB gzip** (was 424) · no secrets in the build or in committable files.

## Design system & accessibility (macapp-48)

- **Refreshed design system:** shared light/dark colours; Space Grotesk headings, Inter text, JetBrains
  Mono for prices, seat numbers and ticket codes.
- **Accessible contrast:** every text colour meets WCAG AA in both themes (checked by script); coral
  buttons/text, muted text, red warnings and form borders adjusted where the spec fell short.
- **Restyled UI kit:** buttons (new pill call-to-action), inputs, cards, dialogs, sheets, tabs, badges,
  menus, tooltips and checkboxes match the redesign, with a clearly visible keyboard focus ring.
- **Seat map component:** an accessible `SeatMap` (price tiers, best-available, mini-map, pinch-zoom) was
  built and tested, but at the owner's request the release keeps the **familiar grid layout** (see Pages).
  The component stays in the UI kit, unused.
- **Phone-friendly:** dialogs fit and scroll on small screens, tabs stay on one scrolling row, toast close
  buttons are visible on touch screens, touch targets are at least 24 px.
- **Reduce Motion respected:** animations and transitions switch off when the device asks.
- **Loading and empty states:** card-shaped placeholders and a shared empty-state layout.
- **Accessibility audit:** every page (admin included) checked by keyboard, screen-reader semantics,
  contrast and layout at 375 and 412 px in both themes; no sideways scrolling at either width.

## Security & backend (macapp-0f)

- **Secure sessions:** sign-in uses an HttpOnly session cookie (1 day). Logging out or changing your
  password ends all your other sessions.
- **Brute-force protection:** per-IP rate limits plus a 15-minute account lock after 5 wrong passwords,
  stored in MongoDB so it works across all serverless instances.
- **Admin setup locked:** disabled unless `ADMIN_SETUP_TOKEN` is set; can't create a second admin; admin
  rights are re-checked on every request.
- **Google sign-in hardened:** state + PKCE against login hijacking; never merges with an existing
  password account.
- **Cross-site protection:** Origin check on every change request, a CORS allowlist, and security headers
  (CSP, no framing, HSTS).
- **Ticket check-in:** admin-only, can't happen twice, and records who checked the ticket in and when.
  Opening a ticket link only shows its status.
- **Seat holds:** capped per user, at most 15 minutes, tied to their event. A seat can't be double-booked,
  and cancelled seats can be sold again.
- **Privacy:** nobody can see other users' bookings; spreadsheet exports are safe to open in Excel; draft
  events stay hidden; the events list shows only upcoming events.
- **Passwords** must be 10–72 characters. Error messages no longer expose internals.
- **Seed safety:** `server/seed.ts` refuses any non-local database unless `SEED_ALLOW_REMOTE=1`.
- **Seat pricing is cinema style:** front cheapest, balcony highest. Existing events were re-priced (live
  migration, see below), and past bookings keep their paid price.

## Bugs, routing & performance (macapp-67)

- **No login token in the browser:** the app reads who's signed in from the server (`/api/auth/me`).
- **Deep links:** refreshing or opening a link to My tickets, Profile or Admin no longer bounces to
  sign-in; after signing in you return to where you were.
- **Sign-out clears everything:** cached bookings and profile data are cleared, and other open tabs sign
  out too.
- **First page load about two-thirds smaller:** 424 → 138 KB of JavaScript (gzip); charts and PDF load
  only on the pages that use them. In-page Web Vitals (production build, localhost, desktop): FCP 100 ms,
  LCP 440 ms, CLS 0 (not a Lighthouse score).
- **Booking fixes:** seat holds work again after the server hardening; the seat map can't show another
  event's seats; cancelled bookings no longer count toward your seat limit; a brief network error no
  longer kicks you off an event page.
- **Admin:** editing an event no longer moves its date a day earlier in Indian time.
- **Scanner:** accepts tickets from this site (plus configured domains), not one hard-coded address.

## Pages & flows (macapp-52)

- **Owner-approved (2026-11-01, via macapp-cf):** the restored seat layout with cinema pricing.
- **Seat picker: the familiar grid, slightly improved,** running on the fixed booking logic: keyboard
  roving focus (arrow keys, Enter/Space), descriptive seat labels, the Zoom toolbar, "Select Seats" moves
  focus to the grid, wheelchair seats supported. No layout switch or flag.
- **Fixed lost seat holds** when several seats were picked at once.
- **Clear messages** when a hold or booking is refused (seat taken, seat limit, expired hold) and for too
  many attempts (429, with the wait time).
- **Ticket QR codes carry the ticket token;** old booking-id QR codes still validate.
- **Check-in** no longer marks a ticket used on page load; staff confirm with "Mark as used" (admins only).
- **Admin pages load again** for admins after the session change; Profile shows the real name and email.
- **Admin setup** shows "disabled" when the server has no setup token, and accepts the token when it does.
- **Accessibility:** booking-cancel confirmation dialog, named event-card links and action buttons, the
  mobile menu as a proper modal, an error screen that keeps the header, contrast fixes.
- **Passwords:** 10–72 characters with a hint; the no-op "Remember me" is removed and "Forgot password"
  gives honest guidance.

Status: tsc 0, web tests 16 files / 95 passing, lint at or below baseline. The restored grid is
checked against the previous behaviour by 13 old-vs-new comparison tests.

## App shell & tooling (macapp-19)

- **Deep links work:** signed-in and admin pages wait for the session check instead of bouncing to
  sign-in and then home on refresh (route guards).
- **Crash recovery:** a crash in one page shows a recovery message and keeps the header; the scanner and
  ticket-validation pages get a full-screen recovery screen. "Try again" reloads only for a stale page file.
- **Page titles and focus:** every page has its own tab title; after navigation, focus moves to the new
  page's heading (or linked section) and screen readers announce it.
- **First load 68% lighter:** 424 → 138 KB gzip of JavaScript; the PDF and chart libraries now load only
  on the ticket and admin pages (found by macapp-67).
- **Security headers:** Content-Security-Policy, HSTS, frame and MIME protections on every response
  (policy by macapp-0f, verified in a browser with zero violations).
- **Tests:** Vitest for the web app and the server, with an in-memory MongoDB replica set; type-checks
  for app, server and tests.

## Deploying (Vercel)

- Deploy = push to `main`; Vercel builds with `npm install` + `npm run build` (unchanged).
- **No new environment variables are required.** `ALLOWED_ORIGIN` and `APP_URL` fall back to the Vercel
  production URL (`VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`), never the request's Host header.
  Leave `ADMIN_SETUP_TOKEN` unset (admin setup stays disabled).
- Security headers come from `vercel.json` (`headers`); API responses are `no-store`.

## Before you push: live database steps (run from the repo root)

> **DONE on 2026-11-01** by the owner: `ratelimits` TTL index `resetAt_1`, unique sparse
> `bookings.ticket_token_1`, and 2/2 orphan `bookingseats` deleted. Logged in `docs/LIVE-DB-LOG.md`;
> backup in `~/Backups/seatsync/2026-11-01_2157`. (The first attempt of step 2 failed silently because of
> `set -e` around a captured command; the script now prints the error and exits non-zero.)

The scripts read `MONGODB_URI` from `.env` without printing it.

1. `bash docs/live-db/1-backup-and-check.sh` (**read-only**): full `mongodump` to
   `~/Backups/seatsync/<date>/` (mode 700), then per-collection counts, `ticket_token` duplicate groups and
   orphan `bookingseats`. Prints the restore command:
   `mongorestore --uri "$MONGODB_URI" --drop ~/Backups/seatsync/<date>`.
2. `bash docs/live-db/2-apply-changes.sh` (refuses to run without a backup):
   1. `db.ratelimits.createIndex({resetAt:1},{expireAfterSeconds:0})`
   2. `db.bookings.createIndex({ticket_token:1},{unique:true,sparse:true})`, skipped automatically if
      duplicates exist
   3. deletes orphan `bookingseats` (booking missing/cancelled/refunded) by exact `_id`

   Logs to `docs/LIVE-DB-LOG.md`. **Verify:** it prints the index names and a deleted count that matches
   step 1's orphan count. **Undo:** `db.ratelimits.dropIndex('resetAt_1')`,
   `db.bookings.dropIndex('ticket_token_1')`; for the orphans, restore only `bookingseats` from the backup
   (`mongorestore --uri "$MONGODB_URI" --nsInclude '<db>.bookingseats' --drop <backup dir>`).

### Live step 3: cinema seat pricing (run before the push)

> **DONE on 2026-11-01** by the owner: 5 events re-priced cinema-style (Free Community Meetup skipped),
> 800 seats updated; backup `~/Backups/seatsync/2026-11-01_2331-before-cinema-pricing`; logged in
> `docs/LIVE-DB-LOG.md`.

New and generated events price the front third at the base price, the middle at base + step, and the
back/balcony at base + 2 × step (step = 25 % of base, rounded to ₹10; free events stay free). The rule
lives in `server/seatPricing.ts`, shared by the seed and admin seat generation. Existing events need this
one-off migration:

1. **Preview (writes nothing):** `bash docs/live-db/3-cinema-pricing.sh`. It prints per event
   `PLAN "<title>": front/middle/back 1499 / 1249 / 999 -> 999 / 1249 / 1499`, or `OK` (already cinema) /
   `SKIP` (active holds, custom mixed prices, single price), then `Would re-price N event(s); skipped M.`
2. **Apply:** `bash docs/live-db/3-cinema-pricing.sh --apply`. It takes a fresh full backup to
   `~/Backups/seatsync/<date>-before-cinema-pricing` (and refuses to continue if that fails), reverses each
   event's per-third seat prices, prints `DONE …` lines plus `Re-priced N event(s); skipped M. Seats updated:
   K.`, and logs to `docs/LIVE-DB-LOG.md`. **Bookings are not changed** (paid totals stay). Events skipped
   for active holds can be re-run later; the script is idempotent.
3. **Verify:** re-run the preview: `Would re-price 0 event(s)` (everything `OK` or `SKIP`). On the site, a
   re-priced event's front rows show the lowest price.
4. **Undo (seats only):** `mongorestore --uri "$MONGODB_URI" --nsInclude '*.seats' --drop
   ~/Backups/seatsync/<date>-before-cinema-pricing` (the script prints the exact path).

The script prints all output, reports failures on stderr with a non-zero exit, and never logs a failed run.
Tested on a throwaway local mongod, including the failure path.

## After deploy

- **Every user signs in again once:** the session moved from a browser token to a secure cookie.
- Nothing else changes for existing users: old ticket QR links (`/validate/<bookingId>`) still validate,
  and existing bookings, holds and seats are untouched.
- Admins re-grant nothing; admin status is read from the database on every request.

## Commit plan (stage by name; nothing below is committed yet)

Each commit groups one area. Intermediate commits are not guaranteed to build alone; the final tree is the
one verified above. Never stage `.env`, anything in `~/Backups`, or scratch files.

1. `chore(test): add Vitest with in-memory MongoDB and per-project type checks`:
   `package.json`, `package-lock.json`, `bun.lockb` (deleted: stale), `vitest.config.ts`,
   `tsconfig.app.json`, `tsconfig.test.json`, `test/`
2. `feat(server): cookie sessions, rate limits, locked admin setup and safe seat holds`:
   `server/`, `api/`, `docs/live-db/`
3. `feat(auth): read the session from the server and guard signed-in routes`:
   `src/lib/`, `src/providers/`, `src/hooks/`
4. `feat(ui): redesigned design system and new fonts`:
   `src/components/ui/` **except** the dev-only, never-imported `seat-map.preview.html`,
   `seat-map.preview.tsx` and `dev/a11yAudit.ts` (keep them on disk, don't commit),
   `tailwind.config.ts`, `src/index.css`, `index.html`
5. `feat(pages): improved seat grid, clearer booking errors and admin fixes`:
   `src/pages/`, `src/components/` (non-`ui`), including `src/components/legacy/SeatSelectionLegacy.tsx`
   (a test reference imported by `SeatSelection.compare.test.tsx`; not used by the app). **Not**
   `docs/seat-layout-restored/` (working screenshots).
6. `feat(app): error recovery, page titles and focus on navigation`: `src/App.tsx`, `src/shell/`
7. `perf(build): keep React out of the chart and PDF chunks` (−68% first-load JS): `vite.config.ts`
8. `feat(security): Content-Security-Policy and hardening headers`: `vercel.json`
9. `docs: audit plan, release notes and live-database steps`: `docs/AUDIT-PLAN.md`,
   `docs/RELEASE-NOTES.md`, `docs/LIVE-DB-LOG.md`
10. `docs: back up the pre-redesign seat layout`: `docs/seat-layout-backup/` (requested by the owner;
    the three screenshots were checked: signed out, public event page and seat map only, no personal data)

Then: `git push origin main` (deploys to Vercel). Run the live-database steps **before** the push.

## Remaining (at the 00:40 cut-off)

- **Known functional gap (ship blocker to decide):** the admin dashboard doesn't request
  `/api/events?include=past` yet, so since the server change **admins can't see past events** until it's
  wired (macapp-52 / macapp-67).
- **macapp-52, not done:** `usePageTitle` on EventDetail and TicketGenerator (they show the route
  default "Event" / "Your ticket" until then); the remaining non-HIGH accessibility items (see below).

- **macapp-52 status:** done: Profile `/me`, old seat grid restored on the fixed logic (13 comparison tests), ticket-token QR, EventCard link names, the HIGH accessibility items.
- **Booking regression (macapp-67) on the restored grid: PASSED.** Select / deselect / re-select with
  hold and release; held, booked and blocked seats not clickable; 6-seat cap with a "Seat limit reached"
  message; booking → My tickets; "your booking" on return; two-browser race (on hold within 3 s);
  keyboard-only booking; 375 px (no overflow, 28×28 seats). Run before the cinema-pricing change, so the
  final pass re-checks prices.
- **macapp-0f (minor):** `/api/seats` has no `booked_by_me` field; an 11-seat hold returns a vague 400
  "Invalid id list".
- **Accessibility, final re-verify (macapp-48, 00:21): PASS** for everything that landed (web tests 14 files /
  85 passing, app tsc 0): SeatMap swap (21/21), hold timer, testimonial contrast, EventCard link names,
  MyTickets cancel dialog, MobileMenu modal + focus return, Profile parsing, Admin guards / tabs / filter
  label, route focus and titles. (Its SeatMap checks apply to the unused component.)
  **Known, non-blocking:** Admin dialog focus return, 2 unlabelled admin checkboxes, admin action buttons
  without context, "Select Seats" focus, TicketGenerator field errors; low: Profile h1 fallback, View Event
  link name, Events h2, Forgot-password size, sticky "Browse by".
- **macapp-19:** re-run the final check after the items above land.
- **Cinema pricing:** code done (server tests 65/65) and **price check PASSED** (macapp-67, local DBs):
  front < back < balcony on a fresh seed, free event stays 0, "Tickets from" = front price, a 3-seat booking
  total matches the seat sum and the stored amount, and the migration re-priced an old DB while leaving
  confirmed booking totals unchanged (idempotent re-run). Live step 3 done by the owner.
- **Decision for the owner:** keep or delete the unused `src/components/ui/seat-map.tsx` (+ its tests).
- **Owner:** live-database steps are done; give the go to commit and push after the final pass.
