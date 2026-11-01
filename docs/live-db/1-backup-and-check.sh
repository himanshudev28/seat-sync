#!/usr/bin/env bash
# SeatSync live DB: STEP 1 = full backup + read-only checks. Writes NOTHING to the database.
# Prints only counts and the backup path, never the connection string or any data.
set -euo pipefail
REPO="/Users/himanshu/Downloads/Visual Studio/Web Dev/VIbe_code/windsurf/seat-sync-event-palace-main"
cd "$REPO"
U=$(node -e "require('dotenv').config({quiet:true});process.stdout.write(process.env.MONGODB_URI||'')")
[ -n "$U" ] || { echo "MONGODB_URI missing in .env"; exit 1; }

D="$HOME/Backups/seatsync/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$D"; chmod 700 "$HOME/Backups" "$HOME/Backups/seatsync" "$D"
echo "== Backing up to $D"
mongodump --uri "$U" --out "$D" --quiet 2>&1 | sed -E 's#mongodb(\+srv)?://[^ ]+#<uri>#g'
chmod -R go-rwx "$D"
echo "== Backup files (collection: size)"
find "$D" -name '*.bson' | sort | while read -r f; do printf '  %s: %s bytes\n' "$(basename "$f" .bson)" "$(stat -f %z "$f")"; done

echo "== Read-only checks"
mongosh "$U" --quiet --eval '
  const c = (n) => db.getCollection(n);
  for (const n of db.getCollectionNames().sort()) print("  count " + n + ": " + c(n).countDocuments());
  const dups = c("bookings").aggregate([
    { $match: { ticket_token: { $exists: true } } },
    { $group: { _id: "$ticket_token", n: { $sum: 1 } } },
    { $match: { $or: [ { n: { $gt: 1 } }, { _id: "" }, { _id: null } ] } },
    { $count: "n" } ]).toArray();
  print("  bookings with duplicate/empty/null ticket_token groups: " + (dups[0] ? dups[0].n : 0));
  print("  bookings without ticket_token: " + c("bookings").countDocuments({ ticket_token: { $exists: false } }));
  const orphans = c("bookingseats").aggregate([
    { $lookup: { from: "bookings", localField: "booking_id", foreignField: "_id", as: "b" } },
    { $match: { $or: [ { b: { $size: 0 } }, { "b.status": { $in: ["cancelled", "refunded"] } } ] } },
    { $count: "n" } ]).toArray();
  print("  orphan bookingseats (booking missing, cancelled or refunded): " + (orphans[0] ? orphans[0].n : 0));
  print("  existing indexes on ratelimits: " + (db.getCollectionNames().includes("ratelimits") ? JSON.stringify(c("ratelimits").getIndexes().map(i => i.name)) : "(collection not created yet)"));
' 2>&1 | sed -E 's#mongodb(\+srv)?://[^ ]+#<uri>#g'
echo
echo "Restore (only if ever needed):  mongorestore --uri \"\$MONGODB_URI\" --drop \"$D\""
