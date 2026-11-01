import { useState, useEffect, useRef, useMemo, memo, type KeyboardEvent } from "react";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { compareRows, formatPrice } from "@/lib/utils";

const HOLD_DURATION_MS = 10 * 60 * 1_000;
const POLL_INTERVAL_MS = 5_000;

/**
 * The original seat grid's look (Front / Back / Balcony, split rows, curved screen), with clearer states.
 * Status is never colour alone: on hold is dashed, booked is faded and struck, yours has a tick.
 */
type SeatState = "available" | "selected" | "reserved" | "booked" | "yours" | "unavailable";
const SEAT_STATES: Record<SeatState, { label: string; speak: string; className: string }> = {
  available: {
    label: "Available",
    speak: "available",
    className: "border-border bg-transparent text-foreground/80 hover:border-primary hover:bg-primary/10 hover:text-foreground",
  },
  selected: {
    label: "Selected",
    speak: "selected",
    className: "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]",
  },
  reserved: {
    // Dashed reads as temporary: a hold expires, a booking doesn't.
    label: "On hold",
    speak: "on hold",
    className: "border-dashed border-warning bg-warning/15 text-warning cursor-not-allowed",
  },
  booked: {
    label: "Booked",
    speak: "booked",
    className: "border-transparent bg-muted-foreground/20 text-muted-foreground line-through cursor-not-allowed",
  },
  yours: {
    label: "Your booking",
    speak: "your booking",
    className: "border-success bg-success/15 text-success cursor-default",
  },
  unavailable: {
    label: "Unavailable",
    speak: "unavailable",
    className: "border-transparent bg-transparent text-muted-foreground/40 cursor-not-allowed [background-image:repeating-linear-gradient(135deg,hsl(var(--muted-foreground)/0.18)_0_2px,transparent_2px_6px)]",
  },
};
const priceText = (p: number) => (p === 0 ? "Free" : formatPrice(p));

type Seat = {
  id: string;
  row: string;
  number: number;
  status: string;
  price: number;
  event_id: string;
  created_at: string;
  updated_at: string;
  booked_by_me?: boolean;
  /** Server (signed in): this user's own live hold. The hold API refreshes it, so the seat stays selectable. */
  held_by_me?: boolean;
  /** Server: 'standard' | 'vip' | 'blocked'. Blocked seats can't be held (the server answers 409). */
  seat_type?: string;
  label?: string | null;
};

type SeatSelectionProps = {
  eventId: string;
  onSeatSelect: (selectedSeats: string[], totalPrice: number) => void;
  /** Seats this user may still pick (event limit minus seats already booked). Sizes "best available"; the
   *  server's hold cap and the booking check remain the enforcement. */
  maxSelectable?: number;
  /** The cheapest seat a buyer can actually get (blocked seats left out), whenever the seat prices change. */
  onMinPrice?: (min: number | null) => void;
};


const SeatSelection = ({ eventId, onSeatSelect, maxSelectable, onMinPrice }: SeatSelectionProps) => {
  const { user } = useAuth();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [rows, setRows] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userBookedSeats, setUserBookedSeats] = useState<string[]>([]);
  // seatId → hold-expiry timestamp (ms)
  const [holdExpiries, setHoldExpiries] = useState<Map<string, number>>(new Map());
  const [countdown, setCountdown] = useState<string | null>(null);

  // Stable refs so interval/beforeunload closures always read the latest values
  const selectedSeatIdsRef = useRef<string[]>([]);
  const seatsRef = useRef<Seat[]>([]);
  const onSeatSelectRef = useRef(onSeatSelect);
  const lastServerEtag = useRef<string | null>(null);
  const isVisibleRef = useRef(true);
  const pollAbortRef = useRef<AbortController | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const userBookedAbortRef = useRef<AbortController | null>(null);
  const prevEventIdRef = useRef(eventId);
  // Per-seat requests in flight. A second click while a HOLD is in flight is a double click and is ignored; a
  // click while a RELEASE is in flight is queued behind it (re-selecting a seat you just dropped). This replaces
  // the old 100 ms global throttle, which dropped the 2nd+ seat when the map adds "best available" seats together.
  const pendingHolds = useRef<Set<string>>(new Set());
  const pendingReleases = useRef<Map<string, Promise<void>>>(new Map());
  selectedSeatIdsRef.current = selectedSeatIds;
  seatsRef.current = seats;
  // keep onSeatSelectRef current every render
  useEffect(() => { onSeatSelectRef.current = onSeatSelect; });

  // Auth rides on the HttpOnly session cookie; only the content type is needed.
  const JSON_HEADERS: Record<string, string> = { "Content-Type": "application/json" };

  // ── normalise MongoDB _id → id ────────────────────────────────────────────────
  const applySeats = (raw: any[]) => {
    const list: Seat[] = raw.map((s) => ({ ...s, id: String(s._id ?? s.id) }));
    // Only update React state if something actually changed — avoids full seat-grid re-render
    // on every poll when seats are idle (common case: no bookings happening)
    const prev = seatsRef.current;
    const hasChanges =
      list.length !== prev.length ||
      list.some((s) => {
        const old = prev.find((p) => p.id === s.id);
        return !old || old.status !== s.status;
      });
    if (hasChanges) {
      setSeats(list);
      setRows(Array.from(new Set(list.map((s) => s.row))).sort(compareRows));
    }
    return list;
  };

  // ── release specific holds via API ────────────────────────────────────────────
  const releaseHolds = async (seatIds: string[]) => {
    if (!seatIds.length) return;
    try {
      await fetch("/api/seats/release", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ seatIds }),
      });
    } catch (err) {
      console.error("Error releasing holds:", err);
    }
  };

  // ── event switch: drop everything that belonged to the previous event ───────
  useEffect(() => {
    if (prevEventIdRef.current === eventId) return;
    prevEventIdRef.current = eventId;
    // The previous effect's cleanup already aborted its requests and released its holds.
    lastServerEtag.current = null;
    seatsRef.current = [];
    selectedSeatIdsRef.current = [];
    setSeats([]);
    setRows([]);
    setSelectedSeatIds([]);
    setHoldExpiries(new Map());
    setUserBookedSeats([]);
    setCountdown(null);
    setError(null);
    setLoading(true);
    onSeatSelectRef.current([], 0);
  }, [eventId]);

  // ── mount effect: initial load, polling, page-unload cleanup ─────────────────
  useEffect(() => {
    lastServerEtag.current = null;
    fetchSeats();
    if (user) fetchUserBookedSeats();

    const pollId = setInterval(() => {
      if (isVisibleRef.current) pollSeats();
    }, POLL_INTERVAL_MS);

    // Pause polling when tab is hidden (saves requests + battery)
    const handleVis = () => {
      isVisibleRef.current = !document.hidden;
      // When coming back to tab, do an immediate refresh
      if (!document.hidden) pollSeats();
    };
    document.addEventListener("visibilitychange", handleVis);

    // Use keepalive fetch on tab close so the hold is released even if the
    // component unmounts after the page starts unloading
    const handleUnload = () => {
      const ids = selectedSeatIdsRef.current;
      if (!ids.length) return;
      fetch("/api/seats/release", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ seatIds: ids }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(pollId);
      pollAbortRef.current?.abort();
      fetchAbortRef.current?.abort();
      userBookedAbortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVis);
      window.removeEventListener("beforeunload", handleUnload);
      // Release on SPA navigation away
      releaseHolds(selectedSeatIdsRef.current);
    };
  }, [eventId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── countdown tick + auto-expire held seats ───────────────────────────────────
  useEffect(() => {
    if (holdExpiries.size === 0) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const earliest = Math.min(...Array.from(holdExpiries.values()));
      const remaining = Math.max(0, earliest - Date.now());
      const mins = Math.floor(remaining / 60_000);
      const secs = Math.floor((remaining % 60_000) / 1_000);
      setCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);

      // Auto-remove expired holds from the selection
      const now = Date.now();
      const expired: string[] = [];
      holdExpiries.forEach((exp, id) => { if (exp <= now) expired.push(id); });
      if (expired.length) {
        setSelectedSeatIds((prev) => {
          const kept = prev.filter((id) => !expired.includes(id));
          const total = seatsRef.current
            .filter((s) => kept.includes(s.id))
            .reduce((sum, s) => sum + s.price, 0);
          onSeatSelectRef.current(kept, total);
          return kept;
        });
        setHoldExpiries((prev) => {
          const next = new Map(prev);
          expired.forEach((id) => next.delete(id));
          return next;
        });
        toast({
          title: "Hold expired",
          description: "Your seat hold has expired. Please re-select your seats.",
          variant: "destructive",
        });
      }
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [holdExpiries]);

  const fetchUserBookedSeats = async () => {
    if (!user) return;
    userBookedAbortRef.current?.abort();
    const ctrl = new AbortController();
    userBookedAbortRef.current = ctrl;
    try {
      const res = await fetch(`/api/bookings?userId=${user.id}`, { signal: ctrl.signal });
      if (!res.ok) return;
      const bookings: any[] = await res.json();
      if (ctrl.signal.aborted) return;
      // Cancelled / refunded bookings no longer own their seats.
      const eventBookings = bookings.filter(
        (b) => b.status === "confirmed" && String(b.event?._id ?? b.event_id ?? "") === eventId
      );
      const seatIds = eventBookings
        .flatMap((b) =>
          (b.booking_seats ?? []).map(
            (bs: any) => String(bs.seat?._id ?? bs.seat?.id ?? "")
          )
        )
        .filter(Boolean);
      setUserBookedSeats(seatIds);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error("Error fetching user booked seats:", err);
    }
  };

  // ── poll every 5 s; detect seats stolen from our hold ────────────────────────
  const pollSeats = async () => {
    // Cancel any previous in-flight poll to prevent response pile-up on slow networks
    pollAbortRef.current?.abort();
    const ctrl = new AbortController();
    pollAbortRef.current = ctrl;
    try {
      const res = await fetch(`/api/seats?eventId=${eventId}`, { signal: ctrl.signal });
      if (!res.ok) return;
      // Skip state update if server data hasn't changed
      const etag = res.headers.get('x-seats-etag') || res.headers.get('last-modified');
      if (etag && etag === lastServerEtag.current) return;
      if (etag) lastServerEtag.current = etag;

      const body = await res.json();
      if (ctrl.signal.aborted) return; // event changed or unmounted while reading
      const normalised = applySeats(body);

      const stolen = selectedSeatIdsRef.current.filter((id) => {
        const s = normalised.find((x) => x.id === id);
        return s && s.status === "booked";
      });
      if (stolen.length) {
        setSelectedSeatIds((prev) => {
          const kept = prev.filter((id) => !stolen.includes(id));
          const total = normalised
            .filter((s) => kept.includes(s.id))
            .reduce((sum, s) => sum + s.price, 0);
          onSeatSelectRef.current(kept, total);
          return kept;
        });
        setHoldExpiries((prev) => {
          const next = new Map(prev);
          stolen.forEach((id) => next.delete(id));
          return next;
        });
        toast({
          title: "Seat taken",
          description: `${stolen.length} seat(s) were booked by someone else and removed from your selection.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // expected — previous poll cancelled
      // silent – transient poll failures should not disrupt UX
    }
  };

  const fetchSeats = async () => {
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seats?eventId=${eventId}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("Failed to fetch seats");
      const raw: any[] = await res.json();
      if (ctrl.signal.aborted) return;
      applySeats(raw);
    } catch (err: any) {
      if (ctrl.signal.aborted) return; // superseded by another event / unmounted
      console.error("Error fetching seats:", err);
      setError(err.message || "Failed to load seats");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  // Price of a selection, always from the server's own per-seat prices.
  const totalOf = (ids: string[]) =>
    seatsRef.current.filter((s) => ids.includes(s.id)).reduce((sum, s) => sum + s.price, 0);
  // Several holds can resolve in any order: always build on the latest selection, not this render's copy.
  const commitSelection = (ids: string[]) => {
    selectedSeatIdsRef.current = ids;
    setSelectedSeatIds(ids);
    onSeatSelect(ids, totalOf(ids));
  };

  const handleSeatClick = async (seat: Seat): Promise<void> => {
    if (pendingHolds.current.has(seat.id)) return;
    const releasing = pendingReleases.current.get(seat.id);
    if (releasing) {
      await releasing;
      const fresh = seatsRef.current.find((s) => s.id === seat.id) ?? seat;
      return handleSeatClick(fresh);
    }
    if (userBookedSeats.includes(seat.id)) {
      toast({ title: "Already booked", description: "You've already booked this seat." });
      return;
    }

    const isSelected = selectedSeatIdsRef.current.includes(seat.id);

    if (isSelected) {
      // Deselect → release hold immediately
      commitSelection(selectedSeatIdsRef.current.filter((id) => id !== seat.id));
      setHoldExpiries((prev) => { const n = new Map(prev); n.delete(seat.id); return n; });
      const done = releaseHolds([seat.id]).finally(() => pendingReleases.current.delete(seat.id));
      pendingReleases.current.set(seat.id, done);
      await done;
      // The seat is free again (our hold is gone), whatever the last poll said.
      setSeats((prev) => prev.map((s) => (s.id === seat.id && s.status === "reserved" ? { ...s, status: "available", held_by_me: false } : s)));
      return;
    }

    const mine = seat.status === "reserved" && seat.held_by_me;
    if ((seat.status !== "available" && !mine) || seat.seat_type === "blocked") return;

    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to select seats.", variant: "destructive" });
      return;
    }

    // Attempt to hold the seat atomically before adding to selection
    pendingHolds.current.add(seat.id);
    try {
      const res = await fetch("/api/seats/hold", {
        method: "POST",
        headers: JSON_HEADERS,
        // The server validates the seats against this event (and rejects past or closed events).
        body: JSON.stringify({ eventId, seatIds: [seat.id] }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message: string = typeof data.error === "string" ? data.error : "";
        if (res.status === 409 && /at most \d+ seats/i.test(message)) {
          // Hold cap reached: the seat itself is still free, so leave it as it is.
          toast({ title: "Seat limit reached", description: message, variant: "destructive" });
        } else if (res.status === 409) {
          toast({ title: "Seat just taken", description: message || "This seat was just reserved by someone else.", variant: "destructive" });
          // Reflect the new status locally so the seat turns yellow immediately
          setSeats((prev) => prev.map((s) => s.id === seat.id ? { ...s, status: "reserved" } : s));
        } else {
          toast({ title: "Could not hold seat", description: data.error || "Please try again.", variant: "destructive" });
        }
        return;
      }

      // Hold confirmed – add to selection and start countdown
      const expiry = Date.now() + HOLD_DURATION_MS;
      if (!selectedSeatIdsRef.current.includes(seat.id)) commitSelection([...selectedSeatIdsRef.current, seat.id]);
      setHoldExpiries((prev) => new Map(prev).set(seat.id, expiry));
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to hold seat", variant: "destructive" });
    } finally {
      pendingHolds.current.delete(seat.id);
    }
  };

  // ── HOOKS MUST COME BEFORE ANY CONDITIONAL RETURNS (Rules of Hooks) ──────────
  const seatsByRow = useMemo(() => {
    const map = new Map<string, Seat[]>();
    for (const seat of seats) {
      if (!map.has(seat.row)) map.set(seat.row, []);
      map.get(seat.row)!.push(seat);
    }
    for (const rowSeats of map.values()) {
      rowSeats.sort((a, b) => a.number - b.number);
    }
    return map;
  }, [seats]);

  const bookedByMe = (s: Seat) => !!s.booked_by_me || userBookedSeats.includes(s.id);
  /** One place decides what a seat is. Unknown statuses and blocked seats fail closed. */
  const stateOf = (s: Seat): SeatState => {
    if (bookedByMe(s)) return "yours";
    if (selectedSeatIds.includes(s.id)) return "selected";
    if (s.seat_type === "blocked") return "unavailable";
    if (s.status === "booked") return "booked";
    // My own hold (e.g. after a refresh) is not "on hold by someone else": it stays pickable.
    if (s.status === "reserved" || s.status === "held") return s.held_by_me ? "available" : "reserved";
    return s.status === "available" ? "available" : "unavailable";
  };

  // Seats in reading order, row by row, for arrow-key moves.
  const orderedRows = useMemo(() => rows.map((r) => seatsByRow.get(r) ?? []).filter((r) => r.length > 0), [rows, seatsByRow]);
  // One tab stop for the whole grid (roving tabindex); arrows move between seats.
  const [focusId, setFocusId] = useState<string | null>(null);
  const tabStopId = useMemo(() => {
    const all = orderedRows.flat();
    if (focusId && all.some((s) => s.id === focusId)) return focusId;
    return selectedSeatIds.find((id) => all.some((s) => s.id === id)) ?? all.find((s) => s.status === "available")?.id ?? all[0]?.id ?? null;
  }, [orderedRows, focusId, selectedSeatIds]);
  const gridRef = useRef<HTMLDivElement>(null);
  const minPrice = useMemo(() => {
    const prices = seats.filter((s) => s.seat_type !== "blocked").map((s) => s.price);
    return prices.length ? Math.min(...prices) : null;
  }, [seats]);
  const onMinPriceRef = useRef(onMinPrice);
  onMinPriceRef.current = onMinPrice;
  useEffect(() => {
    if (!loading) onMinPriceRef.current?.(minPrice);
  }, [minPrice, loading]);
  // On a narrow screen the hall is wider than the card: open it centred on the aisle, and say it scrolls.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const centred = useRef(false);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const extra = el.scrollWidth - el.clientWidth;
    setOverflowing(extra > 4);
    if (!centred.current && extra > 4) {
      centred.current = true;
      el.scrollLeft = extra / 2;
    }
  }, [loading, seats.length]);
  const focusSeat = (id: string) => {
    setFocusId(id);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-seat="${CSS.escape(id)}"]`)?.focus();
  };
  const onSeatKeyDown = (e: KeyboardEvent<HTMLButtonElement>, seat: Seat) => {
    const r = orderedRows.findIndex((row) => row.some((s) => s.id === seat.id));
    if (r < 0) return;
    const row = orderedRows[r];
    const i = row.findIndex((s) => s.id === seat.id);
    const nearest = (target: Seat[]) =>
      target.reduce((best, s) => (Math.abs(s.number - seat.number) < Math.abs(best.number - seat.number) ? s : best), target[0]);
    let next: Seat | undefined;
    if (e.key === "ArrowRight") next = row[i + 1];
    else if (e.key === "ArrowLeft") next = row[i - 1];
    else if (e.key === "ArrowDown" && orderedRows[r + 1]) next = nearest(orderedRows[r + 1]);
    else if (e.key === "ArrowUp" && orderedRows[r - 1]) next = nearest(orderedRows[r - 1]);
    else if (e.key === "Home") next = row[0];
    else if (e.key === "End") next = row[row.length - 1];
    else return;
    e.preventDefault();
    if (next) focusSeat(next.id);
  };

  const onSeatActivate = (seat: Seat) => {
    setFocusId(seat.id);
    const state = stateOf(seat);
    if (state !== "available" && state !== "selected") return;
    if (state === "available" && maxSelectable != null && selectedSeatIdsRef.current.length >= maxSelectable) {
      toast({
        title: "Seat limit reached",
        description: maxSelectable > 0 ? `You can pick up to ${maxSelectable} seat${maxSelectable === 1 ? "" : "s"} for this event.` : "You can't book more seats for this event.",
        variant: "destructive",
      });
      return;
    }
    void handleSeatClick(seat);
  };

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="mx-auto mb-12 w-full max-w-5xl rounded-3xl border border-border bg-card p-6 md:p-10">
        <div className="mx-auto mb-10 h-3 w-2/3 max-w-[600px] animate-pulse rounded-full bg-surface-elevated motion-reduce:animate-none" />
        <div className="mx-auto grid max-w-md grid-cols-10 gap-2" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-surface-elevated motion-reduce:animate-none" />
          ))}
        </div>
        <span className="sr-only">Loading seating plan…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto mb-12 max-w-md rounded-3xl border border-destructive/30 bg-card p-8 text-center">
        <p className="font-display text-lg font-semibold text-foreground">We couldn't load the seats</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          onClick={fetchSeats}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Try again
        </button>
      </div>
    );
  }

  // Seating is the organiser's call. This used to silently POST a 10×9 grid
  // whenever the map came back empty, so the first admin to open the event
  // page created a layout nobody asked for — and the admin's own "Manage
  // Seats" dialog then disagreed with what was in the database.
  if (seats.length === 0) {
    return (
      <div className="text-center py-12 rounded-3xl border border-border bg-card">
        <p className="font-display text-lg font-semibold text-foreground">Seating isn't published for this event yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          The organiser hasn't set up the seat map. Please check back soon.
        </p>
      </div>
    );
  }

  // Front / Back / Balcony thirds, as the original layout drew them.
  const third = Math.ceil(rows.length / 3);
  const sections = [
    { name: "Front", rows: rows.slice(0, third), split: false },
    { name: "Back", rows: rows.slice(third, third * 2), split: true },
    { name: "Balcony", rows: rows.slice(third * 2), split: true },
  ].filter((sec) => sec.rows.length > 0);
  const sectionPrice = (sectionRows: string[]) => {
    const prices = sectionRows.flatMap((r) => (seatsByRow.get(r) ?? []).filter((s) => s.seat_type !== "blocked").map((s) => s.price));
    if (prices.length === 0) return null;
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return lo === hi ? priceText(lo) : `${priceText(lo)}–${priceText(hi)}`;
  };

  const renderSeat = (seat: Seat) => {
    const state = stateOf(seat);
    const clickable = state === "available" || state === "selected";
    const vip = seat.seat_type === "vip";
    const wheelchair = seat.seat_type === "wheelchair";
    const extras = [vip && "VIP", wheelchair && "wheelchair space"].filter(Boolean).join(", ");
    return (
      <button
        key={seat.id}
        type="button"
        data-seat={seat.id}
        tabIndex={seat.id === tabStopId ? 0 : -1}
        aria-pressed={state === "selected"}
        aria-disabled={clickable ? undefined : true}
        aria-label={`Row ${seat.row}, seat ${seat.number}, ${priceText(seat.price)}, ${SEAT_STATES[state].speak}${extras ? `, ${extras}` : ""}`}
        title={`${seat.row}${seat.number} · ${priceText(seat.price)} · ${SEAT_STATES[state].label}${extras ? ` · ${extras}` : ""}`}
        onClick={() => onSeatActivate(seat)}
        onKeyDown={(e) => onSeatKeyDown(e, seat)}
        className={`relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[6px] border text-[9px] font-medium transition-all duration-200 motion-reduce:transition-none sm:h-8 sm:w-8 sm:text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${SEAT_STATES[state].className} ${state === "selected" ? "scale-110 motion-reduce:scale-100" : ""}`}
      >
        <span aria-hidden="true" className="scale-[0.85] transform tracking-tighter">
          {state === "yours" ? "✓" : wheelchair && state === "available" ? "♿" : `${seat.row}${seat.number}`}
        </span>
        {vip && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-seat-premium ring-1 ring-card" />}
      </button>
    );
  };

  const rowLabel = (row: string) => (
    <span aria-hidden="true" className="w-4 flex-shrink-0 text-center font-mono text-[10px] font-semibold text-muted-foreground">
      {row}
    </span>
  );
  const renderRow = (row: string, isSplit: boolean) => {
    const sorted = seatsByRow.get(row) || [];
    const halves = isSplit && sorted.length > 4 ? [sorted.slice(0, Math.ceil(sorted.length / 2)), sorted.slice(Math.ceil(sorted.length / 2))] : [sorted];
    return (
      <div key={row} role="group" aria-label={`Row ${row}`} className="mb-3 flex items-center justify-center gap-2 sm:gap-3">
        {rowLabel(row)}
        <div className={`flex items-center ${halves.length > 1 ? "gap-6 md:gap-12" : ""}`}>
          {halves.map((half, i) => (
            <div key={i} className="flex gap-1.5 sm:gap-2">
              {half.map(renderSeat)}
            </div>
          ))}
        </div>
        {rowLabel(row)}
      </div>
    );
  };

  const legend: SeatState[] = ["available", "selected", "reserved", "booked"];
  if (seats.some((s) => bookedByMe(s))) legend.push("yours");
  if (seats.some((s) => stateOf(s) === "unavailable")) legend.push("unavailable");
  const hasVip = seats.some((s) => s.seat_type === "vip");
  const hasWheelchair = seats.some((s) => s.seat_type === "wheelchair");
  const selectedSeats = selectedSeatIds.map((id) => seats.find((s) => s.id === id)).filter((s): s is Seat => !!s);
  const selectedTotal = selectedSeats.reduce((t, s) => t + s.price, 0);

  return (
    <div className="mb-12 w-full max-w-5xl mx-auto rounded-3xl p-4 sm:p-6 md:p-10 bg-card border border-border shadow-2xl relative overflow-hidden">
      {/* Decorative background glows */}
      <div aria-hidden="true" className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full filter blur-[100px] pointer-events-none" />
      <div aria-hidden="true" className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full filter blur-[100px] pointer-events-none" />

      {/* Screen side */}
      <div className="flex flex-col items-center mb-12 relative z-10">
        <h2 className="font-display text-xl md:text-2xl font-bold text-foreground mb-8">Select your seat</h2>
        <div className="w-full max-w-[600px] px-4 relative flex flex-col items-center">
          <svg width="100%" height="20" viewBox="0 0 600 20" preserveAspectRatio="none" aria-hidden="true" className="w-full drop-shadow-sm dark:drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]">
            <path d="M0,20 Q300,0 600,20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-primary/60 dark:text-primary/80" />
          </svg>
          <span className="text-[10px] font-semibold text-muted-foreground tracking-[0.3em] mt-4 uppercase">Screen Side</span>
        </div>
      </div>

      {/* Seating area */}
      {overflowing && (
        <p className="relative z-10 mb-3 text-center text-xs text-muted-foreground">Scroll sideways to see every seat</p>
      )}
      <div ref={scrollerRef} className="w-full overflow-x-auto pb-6 relative z-10">
        <div ref={gridRef} role="group" aria-label="Seats. Use the arrow keys to move between seats." className="flex flex-col items-center w-max mx-auto px-2 sm:px-6">
          {sections.map((sec, i) => {
            const price = sectionPrice(sec.rows);
            return (
              <div key={sec.name} className={`${i === sections.length - 1 ? "mb-2" : "mb-10"} w-full flex flex-col items-center`}>
                <div className="mb-5 flex items-center justify-center w-full max-w-sm">
                  <div className="flex-1 border-b border-border" />
                  <span className="mx-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.25em]">
                    {sec.name}
                    {price && <span className="ml-2 font-mono normal-case tracking-normal text-foreground/80">{price}</span>}
                  </span>
                  <div className="flex-1 border-b border-border" />
                </div>
                {sec.rows.map((row) => renderRow(row, sec.split))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <ul aria-label="Seat legend" className="flex flex-wrap gap-x-6 gap-y-3 justify-center mt-6 pt-6 border-t border-border relative z-10">
        {legend.map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-[4px] border text-[9px] ${SEAT_STATES[key].className.replace(/hover:\S+/g, "")}`}>
              {key === "yours" ? "✓" : ""}
            </span>
            <span className="text-xs text-muted-foreground">{SEAT_STATES[key].label}</span>
          </li>
        ))}
        {hasVip && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-seat-premium" />
            <span className="text-xs text-muted-foreground">VIP</span>
          </li>
        )}
        {hasWheelchair && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="text-xs">♿</span>
            <span className="text-xs text-muted-foreground">Wheelchair space</span>
          </li>
        )}
      </ul>

      {/* Selection summary */}
      <div className="relative z-10 mt-6 text-center text-sm">
        <p role="status" aria-live="polite" className={selectedSeats.length ? "mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg" : "sr-only"}>
          {selectedSeats.length > 0 ? (
            <>
              <span className="font-mono font-bold text-foreground">{selectedSeats.length}</span>{" "}
              <span className="text-foreground/90">seat{selectedSeats.length > 1 ? "s" : ""}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-mono text-foreground">{selectedSeats.map((s) => `${s.row}${s.number}`).join(", ")}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-mono font-bold text-foreground">{priceText(selectedTotal)}</span>
              {maxSelectable != null && <span className="block mt-1 text-xs text-muted-foreground">You can pick up to {maxSelectable}</span>}
            </>
          ) : (
            "No seats selected"
          )}
        </p>
        {/* Held-seat timer: its own element, not a live region, so screen readers aren't read the time every second. */}
        {selectedSeats.length > 0 && countdown && (
          <p className="mt-2 flex items-center justify-center gap-1.5 font-medium text-warning">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Held for{" "}
            <span role="timer" aria-live="off" className="font-mono font-bold text-foreground tabular-nums">
              {countdown}
            </span>
          </p>
        )}
      </div>
    </div>
  );
};

export default memo(SeatSelection);
