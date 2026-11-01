#!/usr/bin/env bash
# SeatSync live DB: STEP 2 = the three approved changes. Run only AFTER step 1 succeeded.
#  1. TTL index on ratelimits.resetAt
#  2. unique sparse index on bookings.ticket_token (skipped automatically if duplicates exist)
#  3. delete orphan bookingseats (booking missing / cancelled / refunded), by exact _id list
# Prints only counts; logs the commands (no data) to docs/LIVE-DB-LOG.md.
# No `set -e`: with it, a mongosh failure inside OUT=$(...) exits before anything is printed (the first
# real run did nothing and said nothing). Failures are checked explicitly below instead.
set -uo pipefail
REPO="/Users/himanshu/Downloads/Visual Studio/Web Dev/VIbe_code/windsurf/seat-sync-event-palace-main"
cd "$REPO"
U=$(node -e "require('dotenv').config({quiet:true});process.stdout.write(process.env.MONGODB_URI||'')")
[ -n "$U" ] || { echo "MONGODB_URI missing in .env"; exit 1; }
ls -d "$HOME"/Backups/seatsync/*/ >/dev/null 2>&1 || { echo "No backup found in ~/Backups/seatsync: run step 1 first."; exit 1; }

OUT=$(mongosh "$U" --quiet --eval '
  const c = (n) => db.getCollection(n);
  const r = [];
  // 1. TTL index
  r.push("ratelimits TTL index: " + c("ratelimits").createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }));
  // 2. ticket_token unique index, only if no duplicates/empties
  const bad = c("bookings").aggregate([
    { $match: { ticket_token: { $exists: true } } },
    { $group: { _id: "$ticket_token", n: { $sum: 1 } } },
    { $match: { $or: [ { n: { $gt: 1 } }, { _id: "" }, { _id: null } ] } }, { $count: "n" } ]).toArray();
  if (bad[0]) r.push("ticket_token index SKIPPED: " + bad[0].n + " duplicate/empty groups (report to Claude)");
  else r.push("bookings ticket_token index: " + c("bookings").createIndex({ ticket_token: 1 }, { unique: true, sparse: true }));
  // 3. orphan bookingseats, deleted by exact ids
  const ids = c("bookingseats").aggregate([
    { $lookup: { from: "bookings", localField: "booking_id", foreignField: "_id", as: "b" } },
    { $match: { $or: [ { b: { $size: 0 } }, { "b.status": { $in: ["cancelled", "refunded"] } } ] } },
    { $project: { _id: 1 } } ]).toArray().map(d => d._id);
  const del = ids.length ? c("bookingseats").deleteMany({ _id: { $in: ids } }).deletedCount : 0;
  r.push("orphan bookingseats deleted: " + del + " (found " + ids.length + ")");
  print(r.join("\n"));
' 2>&1 | sed -E 's#mongodb(\+srv)?://[^ ]+#<uri>#g')
RC=$?
echo "$OUT"
if [ "$RC" -ne 0 ]; then
  echo "FAILED: mongosh exited with $RC. Nothing was logged; fix the error above and run again." >&2
  exit "$RC"
fi

{
  echo
  echo "## $(date '+%Y-%m-%d %H:%M %Z') - SeatSync security deploy prep (run by the user)"
  echo '- `db.ratelimits.createIndex({resetAt: 1}, {expireAfterSeconds: 0})`'
  echo '- `db.bookings.createIndex({ticket_token: 1}, {unique: true, sparse: true})` (skipped if duplicates)'
  echo '- `db.bookingseats.deleteMany({_id: {$in: <orphans: booking missing/cancelled/refunded>}})`'
  echo "- Result:"
  echo "$OUT" | sed 's/^/  - /'
  echo "- Backup taken before: $(ls -d "$HOME"/Backups/seatsync/*/ | tail -1)"
} >> docs/LIVE-DB-LOG.md
echo "Logged to docs/LIVE-DB-LOG.md"
