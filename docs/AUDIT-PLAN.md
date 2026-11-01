# SeatSync — audit & fix plan (lead: macapp-19, orchestrator: macapp-cf)

Goal: fix bugs; audit security, speed, accessibility and mobile; improve the UI. No 3D.
Nothing is committed, pushed or deployed until macapp-cf orders it on the user's word.

## Baseline (2026-10-31, before any change)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **red**: 132 errors, 14 warnings (123 `no-explicit-any`; src 80E/14W, server 42, supabase 5, api 3, plugins 1, tailwind 1) |
| Types (app) | `npx tsc -p tsconfig.app.json --noEmit` | 0 errors, but **`strict: false`, `strictNullChecks: false`** |
| Types (server) | `npx tsc -p tsconfig.server.json --noEmit` | 0 errors (strict) |
| Build | `npm run build` | ok; entry 84 KB gzip; heavy lazy chunks: pdf 184, charts 145, qr 105 KB gzip |
| Tests | — | **none exist** |
| Deps | `npm ls --depth=0` | consistent with package-lock.json |

Stack as found: Vite 5 + React 18 + shadcn/Tailwind + react-query; API = Vercel function `api/index.ts`
(+ `server/api/**`), **MongoDB Atlas via mongoose** (`server/db.ts`, `server/models`), JWT auth, Groq for
admin AI. Supabase (`@supabase/supabase-js`, `supabase/`, `src/integrations/supabase`) is dead code.
Two lockfiles: npm is authoritative (`vercel.json` installs with npm); `bun.lockb` is stale (last touched
2026-05-08, before package-lock's 2026-05-12 changes).

## ⚠️ Live-data safety (read before running anything)

- `.env` `MONGODB_URI` is the **live Atlas** cluster, and `npm run dev` runs the API in-process
  (`plugins/vite-local-api.ts`), so a plain dev server reads and **writes production data**.
- `server/seed.ts` runs `deleteMany({})` on bookings, seats, events and users. Pointed at Atlas it
  **wipes production**. Never run it without an explicit local `MONGODB_URI`. P0 fix (0f): refuse non-local
  URIs unless `SEED_ALLOW_REMOTE=1`.
- Every session runs its own local `mongod` (`/opt/homebrew/bin/mongod`, 6.0) on its own port with a
  dbpath in its scratchpad, **as a one-node replica set** (bookings use transactions; a standalone mongod
  makes every booking 500 — found by 67), and starts everything with the URI in the shell (it beats `.env`):
  ```
  mongod --dbpath <dir> --port <db-port> --bind_ip 127.0.0.1 --replSet rs<you> --fork --logpath <dir>.log
  mongosh --port <db-port> --eval 'rs.initiate({_id:"rs<you>",members:[{_id:0,host:"127.0.0.1:<db-port>"}]})'
  MONGODB_URI="mongodb://127.0.0.1:<db-port>/seatsync_test?replicaSet=rs<you>" npx vite --port <dev-port> --strictPort
  ```
- The seed's events are dated June–Aug 2026 (past), so holds return 403 until the dates move forward
  (0f: make seed dates relative to now). Server tests use `test/mongo.ts` / `server/test/replMongo.ts`
  (in-memory one-node replica sets).
- No OAuth sign-in flows, and no Groq/LLM calls unless mocked. Test accounts only in local DBs.

## House rules

| Session | Area | Dev port | Local DB port |
|---|---|---|---|
| 19 | lead: configs, package.json, vite/eslint/tsconfig, `src/App.tsx`, `src/main.tsx`, routing, `plugins/`, test infra, integration | 5273 | 27073 |
| 0f | security & backend: `server/`, `api/`, `supabase/` removal, `src/integrations`, auth, holds/bookings, rate limits, validation, secrets | 5274 | 27074 |
| 52 | pages UI: `src/pages`, feature components in `src/components` (not `ui/`), incl. Header, Footer, LoadingScreen, ErrorBoundary, OfflineBanner, ScrollToTop | 5275 | 27075 |
| 67 | bugs & performance: `src/hooks`, `src/lib`, data fetching; proposes `vite.config.ts` changes to 19 | 5276 | 27076 |
| 48 | design system, a11y & mobile: `src/components/ui`, `tailwind.config.ts`, `src/index.css`, a11y review of everything | 5277 | 27077 |

- One owner per file. Need a change in someone else's file? Message the owner (or 19 for configs).
- Heavy commands (`npm install`, `npm run build`, Lighthouse) take `/tmp/seatsync-build.lock`
  (`mkdir`, then write `"<session> HH:MM:SS"` to `owner`, then `rm -rf` the lock only if `owner` names you).
- Kill processes by PID only. Never print `.env` values.
- Protected logic: the SeatSelection grid (redesign.md §7). Change it only with a test that shows the bug.

## Gates (every owner before reporting done, 19 at integration)

1. `npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -p tsconfig.server.json --noEmit` → 0 errors
2. `npx eslint <your changed files>` → no new problems (the repo-wide count must not go up from 132E/14W)
3. `npx vitest run` → all green (test infra added by 19: Vitest + jsdom + Testing Library +
   mongodb-memory-server using the local mongod binary)
4. `npm run build` → ok; entry chunk must not grow past 84 KB gzip without a reason

## Audit order

1. **P0 safety**: seed guard; any endpoint that writes without auth; secrets reaching the client bundle.
2. **Security** (0f): authz on admin and booking routes, JWT/cookie flags, rate limits, input validation,
   seat-hold race conditions, CORS/`ALLOWED_ORIGIN`, dependency audit.
3. **Bugs** (67, with 52): booking flow end to end on a local DB, error states, offline banner.
4. **Performance** (67): route chunking, pdf/qr/charts loaded only where used, images, react-query caching.
5. **A11y & mobile** (48, with 52): keyboard and screen reader through booking; 375 px layouts; contrast.
6. **UI polish** (52, 48), then integration and a final report (19).
