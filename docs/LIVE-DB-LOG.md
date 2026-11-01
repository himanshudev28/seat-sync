
## 2026-11-01 23:13 IST - SeatSync security deploy prep (run by the user)
- `db.ratelimits.createIndex({resetAt: 1}, {expireAfterSeconds: 0})`
- `db.bookings.createIndex({ticket_token: 1}, {unique: true, sparse: true})` (skipped if duplicates)
- `db.bookingseats.deleteMany({_id: {$in: <orphans: booking missing/cancelled/refunded>}})`
- Result:
  - ratelimits TTL index: resetAt_1
  - bookings ticket_token index: ticket_token_1
  - orphan bookingseats deleted: 2 (found 2)
- Backup taken before: /Users/himanshu/Backups/seatsync/2026-11-01_2157/

## 2026-11-01 23:31 IST - SeatSync cinema pricing (run by the user)
- Per event: reversed the per-third seat prices by row distance (front cheapest). Bookings untouched.
- Backup taken before: /Users/himanshu/Backups/seatsync/2026-11-01_2331-before-cinema-pricing
- Result:
  - DONE  "Summer Rock Concert": front/middle/back 60 / 55 / 50  ->  50 / 55 / 60
  - SKIP  "Free Community Meetup": mixed prices inside a third (custom pricing); left as is
  - DONE  "Championship Finals 2026": front/middle/back 85 / 80 / 75  ->  75 / 80 / 85
  - DONE  "Romeo & Juliet - Modern Adaptation": front/middle/back 55 / 50 / 45  ->  45 / 50 / 55
  - DONE  "Tech Summit 2026": front/middle/back 35 / 30 / 25  ->  25 / 30 / 35
  - DONE  "Avenger Doomsday": front/middle/back 105 / 102 / 100  ->  100 / 102 / 105
  - Re-priced 5 event(s); skipped 1. Seats updated: 800.
