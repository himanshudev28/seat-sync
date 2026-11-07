import { usePageTitle } from "@/shell";

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import SeatSelection from "@/components/SeatSelection";

import { formatPrice } from "@/lib/utils";
import { ZoomIn, ZoomOut, RotateCcw, ArrowLeft, Calendar, MapPin, SearchX } from "lucide-react";
import { EventImageFallback } from "@/components/EventCard";

type Event = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  price: number;
  category: string;
  image_url: string | null;
  is_free: boolean;
  is_published?: boolean;
  max_seats_per_user: number;
};

async function fetchEventById(eventId: string): Promise<Event> {
  const res = await fetch(`/api/events/${eventId}`);
  if (!res.ok) throw new ApiError(res.status, `Failed: ${res.status}`);
  return res.json();
}

async function fetchUserBookingsForEvent(userId: string, eventId: string): Promise<number> {
  const res = await fetch(`/api/bookings?userId=${userId}`, {
  });
  if (!res.ok) return 0;
  const bookings: Array<{
    status?: string;
    event?: { _id?: string };
    event_id?: string;
    booking_seats?: unknown[];
  }> = await res.json();
  // Cancelled / refunded bookings must not count against the per-user seat limit.
  return bookings
    .filter((b) => b.status === "confirmed" && String(b.event?._id ?? b.event_id ?? "") === eventId)
    .reduce((sum, b) => sum + (b.booking_seats?.length ?? 0), 0);
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [seatRefreshKey, setSeatRefreshKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [minSeatPrice, setMinSeatPrice] = useState<number | null>(null);
  const [imageBroken, setImageBroken] = useState(false);
  // Prevent double-click: ignore repeated calls within 500 ms
  const lastBookingAttempt = useRef(0);

  const {
    data: event,
    isLoading: loading,
    isError,
    error: eventError,
  } = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEventById(id!),
    enabled: !!id,
    staleTime: 30_000,
    // A 404 is a real answer; don't retry it. Transient errors keep the default retries.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
  });
  usePageTitle(event?.title);

  const { data: userBookings = 0 } = useQuery({
    queryKey: ["user-bookings", user?.id, id],
    queryFn: () => fetchUserBookingsForEvent(user!.id, id!),
    enabled: !!user && !!id,
    staleTime: 15_000,
  });

  // Redirect off unpublished / missing events without spamming /api on each render.
  useEffect(() => {
    // Only a 404 (missing / unpublished) redirects; a transient failure keeps the user here.
    const notFound = isError && eventError instanceof ApiError && eventError.status === 404;
    if (!loading && (notFound || (event && !event.is_published))) {
      navigate("/events");
    }
  }, [loading, isError, eventError, event, navigate]);

  const handleBookingDebounced = () => {
    const now = Date.now();
    if (now - lastBookingAttempt.current < 500) return;
    lastBookingAttempt.current = now;
    handleBooking();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleBooking = async () => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to book tickets",
        variant: "destructive",
      });
      // Come back to this event after signing in.
      navigate("/auth", { state: { from: location } });
      return;
    }

    if (selectedSeats.length === 0) {
      toast({
        title: "No seats selected",
        description: "Please select at least one seat to book",
        variant: "destructive",
      });
      return;
    }

    // Check if user is trying to book more than max_seats_per_user allows
    if (event && userBookings + selectedSeats.length > event.max_seats_per_user) {
      toast({
        title: "Booking limit exceeded",
        description: `You can only book a maximum of ${event.max_seats_per_user} seats for this event. You already have ${userBookings} seats booked.`,
        variant: "destructive",
      });
      return;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };

    setBookingLoading(true);
    try {
      // Step 1: Atomically hold all selected seats for 10 minutes.
      // A single updateMany with $or condition prevents race conditions.
      const holdRes = await fetch("/api/seats/hold", {
        method: "POST",
        headers,
        body: JSON.stringify({ eventId: id, seatIds: selectedSeats }),
      });
      // A rate-limited (429) answer may not be JSON.
      const holdData = await holdRes.json().catch(() => ({}));

      if (!holdRes.ok) {
        if (holdRes.status === 409 && /at most \d+ seats/i.test(holdData.error ?? "")) {
          // Hold cap: nothing was taken, so keep the selection and say how many are allowed.
          toast({ title: "Seat limit reached", description: holdData.error, variant: "destructive" });
          return;
        }
        if (holdRes.status === 409) {
          // Another user grabbed one or more seats between selection and submission
          setSeatRefreshKey((k) => k + 1);
          setSelectedSeats([]);
          setTotalPrice(0);
          toast({
            title: "Seats no longer available",
            description: holdData.error || "Some seats were just booked by someone else. Please re-select.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(holdData.error || "Failed to reserve seats");
      }

      // Step 2: Create the booking inside a MongoDB transaction.
      // The API verifies the hold is still valid before committing.
      const bookRes = await fetch("/api/bookings", {
        method: "POST",
        headers,
        body: JSON.stringify({ eventId: id, seatIds: selectedSeats, totalPrice }),
      });
      const bookData = await bookRes.json().catch(() => ({}));

      if (!bookRes.ok) {
        // Best-effort release so seats become available again immediately
        await fetch("/api/seats/release", {
          method: "POST",
          headers,
          body: JSON.stringify({ seatIds: selectedSeats }),
        }).catch(() => {});

        // The holds are gone either way, so the selection is stale: clear it
        // (and remount the seat map) for every failure, not just 409.
        setSeatRefreshKey((k) => k + 1);
        setSelectedSeats([]);
        setTotalPrice(0);

        if (bookRes.status === 409) {
          toast({
            title: "Seats no longer available",
            description: bookData.error || "Seat hold expired. Please re-select.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(bookData.error || "Booking failed");
      }

      toast({
        title: "Booking successful!",
        description: "Your ticket is ready.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["event", id] }),
        queryClient.invalidateQueries({ queryKey: ["user-bookings"] }),
      ]);
      // Straight to the new ticket (it prints in on arrival); My Tickets if the id is missing.
      const newId = typeof bookData?._id === "string" ? bookData._id : null;
      navigate(newId ? `/tickets/${newId}?new=1` : "/tickets");
    } catch (error: any) {
      console.error("Error during booking:", error);
      toast({
        title: "Booking failed",
        description: error.message || "An error occurred during booking",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="pb-24 lg:pb-8" role="status" aria-label="Loading event">
        <Skeleton className="h-64 w-full rounded-none bg-surface-elevated md:h-96" />
        <div className="container mx-auto -mt-10 max-w-7xl px-4">
          <div className="rounded-t-3xl bg-card p-6 shadow-xl md:rounded-2xl md:p-8">
            <Skeleton className="mb-4 h-6 w-20 bg-surface-elevated" />
            <Skeleton className="mb-4 h-9 w-3/4 bg-surface-elevated" />
            <div className="flex flex-wrap gap-4">
              <Skeleton className="h-5 w-40 bg-surface-elevated" />
              <Skeleton className="h-5 w-32 bg-surface-elevated" />
            </div>
            <Skeleton className="mt-6 h-4 w-full bg-surface-elevated" />
            <Skeleton className="mt-2 h-4 w-5/6 bg-surface-elevated" />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-20 text-center">
        <SearchX className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-display text-section mb-2">Event not found</h1>
        <p className="mb-6 max-w-sm text-muted-foreground">
          The event you're looking for doesn't exist or has been removed.
        </p>
        <Button className="h-11 rounded-full px-6" onClick={() => navigate("/events")}>
          Browse Events
        </Button>
      </div>
    );
  }

  // "Tickets from" = the cheapest seat on the map (prices vary by section); the event price until seats load.
  const priceLabel = event.is_free ? "Free" : formatPrice(minSeatPrice ?? event.price);
  // Scroll to the seats, then put keyboard focus on the seat map's tab stop so the next key press picks seats.
  const scrollToSeats = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("seat-selection")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(
      () => document.querySelector<HTMLElement>('[data-seat][tabindex="0"]')?.focus({ preventScroll: true }),
      reduce ? 0 : 450,
    );
  };

  return (
    <div className="pb-28 lg:pb-8 animate-fade-in-up motion-reduce:animate-none">
      {/* Hero */}
      <div className="relative h-64 w-full overflow-hidden bg-surface-secondary md:h-96">
        {/* An image that 404s or is blocked by hotlink protection has to
            land on the same placeholder as a missing one, not a broken icon. */}
        {event.image_url && !imageBroken ? (
          <img
            src={event.image_url}
            alt={event.title}
            decoding="async"
            // Many poster hosts refuse hotlinks (403 when a Referer is sent).
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <EventImageFallback category={event.category} large />
        )}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/50 to-transparent" />
        <div className="container mx-auto max-w-7xl px-4">
          <Link
            to="/events"
            aria-label="Back to events"
            className="absolute top-4 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-glass px-4 text-sm font-semibold text-foreground backdrop-blur-xl transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Events
          </Link>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4">
        {/* Info card overlapping the hero */}
        <section
          aria-labelledby="event-title"
          className="relative -mt-10 rounded-t-3xl bg-card p-6 text-card-foreground shadow-xl md:rounded-2xl md:p-8"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {event.category && <Badge>{event.category}</Badge>}
                {event.is_free && (
                  <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                    Free
                  </Badge>
                )}
              </div>
              <h1 id="event-title" className="font-display text-section mb-4">
                {event.title}
              </h1>
              <ul className="flex flex-col gap-2 text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
                <li className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                  <span>{formatDate(event.date)}</span>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                  <span>{event.location}</span>
                </li>
              </ul>
            </div>
            <div className="md:text-right">
              <p className="font-mono text-data-lg text-primary">{!event.is_free && <span className="font-sans text-sm font-normal text-muted-foreground">from </span>}{priceLabel}</p>
              {!event.is_free && <p className="text-sm text-muted-foreground">per ticket</p>}
            </div>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-6">
            <h2 className="font-display text-card-title mb-3">About this event</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{event.description}</p>
          </div>

          <Separator className="my-6" />
          
          <h2 id="seat-selection" className="font-display text-card-title mb-4 scroll-mt-24">Select Your Seats</h2>
          <div className="flex items-center justify-end gap-2 mb-4">
            <span className="text-xs text-muted-foreground mr-1">Zoom</span>
            <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.6, parseFloat((z - 0.1).toFixed(1))))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs w-8 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.5, parseFloat((z + 0.1).toFixed(1))))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Reset zoom" onClick={() => setZoom(1)}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div
            className="origin-top transition-transform duration-200 motion-reduce:transition-none"
            style={{ transform: `scale(${zoom})` }}
          >
            <SeatSelection
              key={seatRefreshKey}
              eventId={event.id}
              onSeatSelect={(seats, price) => {
                setSelectedSeats(seats);
                setTotalPrice(price);
              }}
              onMinPrice={setMinSeatPrice}
              maxSelectable={
                event.max_seats_per_user > 0 ? Math.max(0, event.max_seats_per_user - userBookings) : undefined
              }
            />
          </div>
        </div>
        
        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-border shadow-xl">
            <CardContent className="p-6">
              <h3 className="text-xl font-bold mb-4">Booking Summary</h3>
              {/* Seat prices vary by row, so the event price is a starting price; the total below is
                  the sum of the seats actually picked (from the seat map). */}
              <div className="flex justify-between mb-2">
                <span>{event.is_free ? "Price" : "Tickets from"}</span>
                <span className="font-mono">{priceLabel}</span>
              </div>
              {!event.is_free && (
                <p className="mb-2 -mt-1 text-xs text-muted-foreground">Price depends on the row you pick.</p>
              )}
              <div className="flex justify-between mb-2">
                <span>Selected seats</span>
                <span>{selectedSeats.length}</span>
              </div>
              {userBookings > 0 && (
                <div className="flex justify-between mb-2 text-warning">
                  <span>Already booked</span>
                  <span>{userBookings} seats</span>
                </div>
              )}
              <Separator className="my-4" />
              <div className="flex justify-between mb-6 font-bold">
                <span>Total</span>
                <span className="font-mono">{event.is_free ? "Free" : formatPrice(totalPrice)}</span>
              </div>
              {event.max_seats_per_user > 0 && (
                <p className="text-xs mb-4 text-muted-foreground">
                  You can book up to {event.max_seats_per_user} seats for this event.
                </p>
              )}
              <Button
                className="w-full"
                size="lg"
                disabled={selectedSeats.length === 0 || bookingLoading}
                onClick={handleBookingDebounced}
              >
                {bookingLoading ? "Processing..." : event.is_free ? "Reserve Now" : "Book Now"}
              </Button>
              {!user && (
                <p className="text-xs text-center mt-2 text-muted-foreground">
                  You need to be signed in to book tickets
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-glass px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-data text-primary">{!event.is_free && <span className="font-sans text-sm font-normal text-muted-foreground">from </span>}{priceLabel}</p>
            {!event.is_free && <p className="text-xs text-muted-foreground">per ticket</p>}
          </div>
          <Button type="button" className="h-12 rounded-full px-8 font-semibold" onClick={scrollToSeats}>
            Select Seats
          </Button>
        </div>
      </div>
    </div>
  );
}
