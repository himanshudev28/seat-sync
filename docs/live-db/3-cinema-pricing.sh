#!/usr/bin/env bash
# SeatSync live DB: STEP 3 = switch existing events to CINEMA pricing (front rows cheapest).
#
#   bash docs/live-db/3-cinema-pricing.sh            # DRY RUN: prints the plan, writes nothing
#   bash docs/live-db/3-cinema-pricing.sh --apply    # backup first, then re-price, then log
#
# Per event: rows are split into thirds by distance from the screen (same ceil split as the
# seat map). Each third's current price is read, and the prices are REVERSED by row distance
# (old back/balcony price → front rows, old front price → back rows). The event keeps its own
# set of prices; only which rows they sit on flips.
# Skipped (and reported): events with active seat holds, events whose rows don't have one
# price per third, and events that are already cinema-ordered or have a single price.
# Bookings are NOT touched: what people paid stays as it is. Seat list prices of already-booked
# seats are updated too (they're list prices; booking totals are stored on the booking).
# Prints only counts/prices/titles, never the connection string.
set -uo pipefail   # no -e: a failing mongosh inside $(...) must still print its error (see RC check)
REPO="/Users/himanshu/Downloads/Visual Studio/Web Dev/VIbe_code/windsurf/seat-sync-event-palace-main"
cd "$REPO" || exit 1
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
U=$(node -e "require('dotenv').config({quiet:true});process.stdout.write(process.env.MONGODB_URI||'')")
[ -n "$U" ] || { echo "MONGODB_URI missing in .env" >&2; exit 1; }
mask() { sed -E 's#mongodb(\+srv)?://[^ ]+#<uri>#g'; }

if [ "$APPLY" = 1 ]; then
  D="$HOME/Backups/seatsync/$(date +%Y-%m-%d_%H%M)-before-cinema-pricing"
  mkdir -p "$D" && chmod 700 "$HOME/Backups" "$HOME/Backups/seatsync" "$D"
  echo "== Fresh backup to $D"
  mongodump --uri "$U" --out "$D" --quiet 2>&1 | mask
  RC=${PIPESTATUS[0]}
  if [ "$RC" -ne 0 ] || [ -z "$(find "$D" -name 'seats.bson' -size +0 2>/dev/null)" ]; then
    echo "FAILED: backup did not complete (mongodump exit $RC). Nothing was changed." >&2
    exit 1
  fi
  chmod -R go-rwx "$D"
fi

OUT=$(mongosh "$U" --quiet --eval "const APPLY = $APPLY;"'
  const seats = db.getCollection("seats"), events = db.getCollection("events");
  const now = new Date();
  const rowKey = (r) => [r.length, r];                       // A..Z before AA..
  const cmp = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
  let changed = 0, skipped = 0, seatsUpdated = 0;
  const lines = [];
  for (const ev of events.find({}, { title: 1 }).toArray()) {
    const label = JSON.stringify(ev.title || String(ev._id));
    const holds = seats.countDocuments({ event_id: ev._id, status: "reserved", heldUntil: { $gt: now } });
    if (holds > 0) { skipped++; lines.push("SKIP  " + label + ": " + holds + " active hold(s); re-run later"); continue; }
    const byRow = seats.aggregate([
      { $match: { event_id: ev._id } },
      { $group: { _id: "$row", prices: { $addToSet: "$price" } } } ]).toArray();
    if (byRow.length < 3) { skipped++; lines.push("SKIP  " + label + ": fewer than 3 rows"); continue; }
    const rows = byRow.map((r) => r._id).sort(cmp);
    const size = Math.ceil(rows.length / 3);
    const tierRows = [rows.slice(0, size), rows.slice(size, size * 2), rows.slice(size * 2)];
    const priceOfRow = Object.fromEntries(byRow.map((r) => [r._id, r.prices]));
    const tierPrice = tierRows.map((rs) => {
      const set = new Set(rs.flatMap((r) => priceOfRow[r]));
      return set.size === 1 ? [...set][0] : null;
    });
    if (tierPrice.some((p) => p === null || tierRows.some((t) => t.length === 0))) {
      skipped++; lines.push("SKIP  " + label + ": mixed prices inside a third (custom pricing); left as is"); continue;
    }
    const [f, m, b] = tierPrice;
    if (f === m && m === b) { skipped++; lines.push("SKIP  " + label + ": one price for all rows (" + f + ")"); continue; }
    if (f <= m && m <= b) { skipped++; lines.push("OK    " + label + ": already cinema-ordered " + [f, m, b].join(" / ")); continue; }
    const next = [b, m, f];
    lines.push((APPLY ? "DONE  " : "PLAN  ") + label + ": front/middle/back " + [f, m, b].join(" / ") + "  ->  " + next.join(" / "));
    if (APPLY) {
      for (let t = 0; t < 3; t++) {
        if (next[t] === tierPrice[t]) continue;
        seatsUpdated += seats.updateMany({ event_id: ev._id, row: { $in: tierRows[t] } }, { $set: { price: next[t] } }).modifiedCount;
      }
    }
    changed++;
  }
  lines.push("");
  lines.push((APPLY ? "Re-priced " : "Would re-price ") + changed + " event(s); skipped " + skipped + "." + (APPLY ? " Seats updated: " + seatsUpdated + "." : ""));
  print(lines.join("\n"));
' 2>&1 | mask)
RC=${PIPESTATUS[0]}
echo "$OUT"
if [ "$RC" -ne 0 ]; then
  echo "FAILED: mongosh exited with $RC. Nothing was logged.$([ "$APPLY" = 1 ] && echo " Restore seats if needed: mongorestore --uri \"\$MONGODB_URI\" --nsInclude '*.seats' --drop \"$D\"")" >&2
  exit "$RC"
fi

if [ "$APPLY" = 1 ]; then
  {
    echo
    echo "## $(date '+%Y-%m-%d %H:%M %Z') - SeatSync cinema pricing (run by the user)"
    echo '- Per event: reversed the per-third seat prices by row distance (front cheapest). Bookings untouched.'
    echo "- Backup taken before: $D"
    echo "- Result:"
    echo "$OUT" | sed '/^$/d; s/^/  - /'
  } >> docs/LIVE-DB-LOG.md
  echo "Logged to docs/LIVE-DB-LOG.md"
  echo "Undo (seats only): mongorestore --uri \"\$MONGODB_URI\" --nsInclude '*.seats' --drop \"$D\""
else
  echo "Dry run only. Re-run with --apply to back up and apply."
fi
