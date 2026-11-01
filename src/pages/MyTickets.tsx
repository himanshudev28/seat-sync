
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import TicketDetails from "@/components/TicketDetails";
import { Tickets, Calendar, Share2, XCircle, AlertCircle, RefreshCw } from "lucide-react";

type Booking = {
  id: string;
  event_id: string;
  total_price: number;
  is_free: boolean;
  status: string;
  created_at: string;
  event: {
    title: string;
    date: string;
    location: string;
  };
  seats: {
    row: string;
    number: number;
  }[];
};

function addToCalendar(booking: Booking) {
  const title = encodeURIComponent(booking.event.title);
  const location = encodeURIComponent(booking.event.location);
  const start = booking.event.date
    ? new Date(booking.event.date).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : "";
  const end = booking.event.date
    ? new Date(new Date(booking.event.date).getTime() + 2 * 60 * 60 * 1000)
        .toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : "";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${decodeURIComponent(title)}`,
    `LOCATION:${decodeURIComponent(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${booking.event.title.replace(/\s+/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MyTickets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchAbortRef = useRef<AbortController | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    // <RequireAuth> guards this route; wait for the user, never redirect from here (it raced on refresh).
    if (!user) return;

    fetchBookings();
    // Abort on unmount / user change so a late response can't set state on stale data.
    return () => fetchAbortRef.current?.abort();
  }, [user]);

  const fetchBookings = async () => {
    if (!user) return;
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`/api/bookings?userId=${user.id}`, { signal: ctrl.signal });
      if (!response.ok) throw new Error("Failed to fetch bookings");
      const raw: any[] = await response.json();
      if (ctrl.signal.aborted) return;

      const normalized: Booking[] = raw.map((b) => ({
        id: b._id ?? b.id,
        event_id: String(b.event?._id ?? b.event_id ?? ""),
        total_price: b.total_price,
        is_free: b.event?.is_free ?? false,
        status: b.status,
        created_at: b.created_at,
        event: {
          title: b.event?.title ?? "Unknown Event",
          date: b.event?.date ?? "",
          location: b.event?.location ?? "",
        },
        seats: (b.booking_seats ?? []).map((bs: any) => ({
          row: bs.seat?.row ?? "",
          number: bs.seat?.number ?? 0,
        })),
      }));

      setBookings(normalized);
    } catch (error: any) {
      if (ctrl.signal.aborted) return;
      console.error("Error fetching bookings:", error);
      setLoadError(true);
      toast({
        title: "Error",
        description: "Failed to load tickets",
        variant: "destructive",
      });
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    // Confirmation happens in the AlertDialog on the Cancel button (no native confirm()).
    setCancellingId(bookingId);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json",  },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      toast({ title: "Cancelled", description: "Your booking has been cancelled." });
      fetchBookings();
      // Cached event pages (seat map, per-user seat count) are stale now that seats were freed.
      void queryClient.invalidateQueries({ queryKey: ["user-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["event"] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCancellingId(null);
    }
  };

  const shareBooking = (booking: Booking) => {
    const url = `${window.location.origin}/events/${booking.event_id}`;
    if (navigator.share) {
      navigator.share({ title: booking.event.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Event link copied to clipboard." });
    }
  };

  if (!user) {
    return null; // Will redirect in useEffect
  }

  const now = new Date();
  // Only confirmed bookings are active tickets; cancelled / refunded ones go to "Past".
  const isActive = (b: Booking) => b.status === "confirmed";
  const upcoming = bookings.filter(
    (b) => isActive(b) && b.event.date && new Date(b.event.date) >= now
  );
  const past = bookings.filter(
    (b) => !isActive(b) || !b.event.date || new Date(b.event.date) < now
  );

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in-up motion-reduce:animate-none">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center">
              <Tickets className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-section">My Tickets</h1>
              <p className="text-sm text-muted-foreground">{bookings.length} booking{bookings.length !== 1 ? "s" : ""} total</p>
            </div>
          </div>
          <Button size="pill" onClick={() => navigate("/events")}>Browse Events</Button>
        </div>

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading tickets">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex overflow-hidden rounded-2xl border border-border bg-card">
                <Skeleton className="hidden sm:block w-28 rounded-none bg-surface-elevated" />
                <div className="flex-1 space-y-3 p-5">
                  <Skeleton className="h-5 w-3/4 bg-surface-elevated" />
                  <Skeleton className="h-4 w-1/2 bg-surface-elevated" />
                  <Skeleton className="h-4 w-1/3 bg-surface-elevated" />
                  <Skeleton className="h-8 w-40 bg-surface-elevated" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <Card>
            <CardContent role="alert" className="text-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
              </div>
              <p className="font-display text-card-title mb-1">Couldn't load your tickets</p>
              <p className="text-muted-foreground mb-6">Check your connection and try again.</p>
              <Button variant="secondary" onClick={fetchBookings}>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : bookings.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-surface-secondary flex items-center justify-center mx-auto mb-4">
                <Tickets className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="font-display text-card-title mb-1">No tickets yet</p>
              <p className="text-muted-foreground mb-6">Book your first event and your tickets will show up here.</p>
              <Button size="pill" onClick={() => navigate("/events")}>Browse events</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-10">
            {upcoming.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-5">
                  <span className="h-2.5 w-2.5 rounded-full bg-success animate-pulse motion-reduce:animate-none" />
                  <h2 className="text-label text-success">Upcoming · {upcoming.length}</h2>
                </div>
                <div className="relative pl-5 border-l-2 border-success/30 space-y-4">
                  {upcoming.map((booking) => (
                    <div key={booking.id} className="relative">
                      <span className="absolute -left-[1.35rem] top-5 h-3 w-3 rounded-full bg-success ring-4 ring-background" />
                      <TicketDetails booking={booking} />
                      <div className="flex flex-wrap gap-2 mt-2 pl-1">
                        <Button size="sm" variant="outline" onClick={() => addToCalendar(booking)}>
                          <Calendar className="h-3.5 w-3.5 mr-1" /> Add to Calendar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => shareBooking(booking)}>
                          <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                              disabled={cancellingId === booking.id}
                              aria-label={`Cancel booking for ${booking.event?.title ?? "this event"}`}>
                              <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                              {cancellingId === booking.id ? "Cancelling..." : "Cancel"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Your seats for {booking.event?.title ?? "this event"} will be released. This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep booking</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => cancelBooking(booking.id)}
                              >
                                Cancel booking
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                  <h2 className="text-label text-muted-foreground">Past · {past.length}</h2>
                </div>
                <div className="relative pl-5 border-l-2 border-border space-y-4 opacity-75">
                  {past.map((booking) => (
                    <div key={booking.id} className="relative">
                      <span className="absolute -left-[1.35rem] top-5 h-3 w-3 rounded-full bg-muted-foreground ring-4 ring-background" />
                      <div className={!isActive(booking) ? "opacity-60 grayscale" : ""}>
                        <TicketDetails booking={booking} />
                        {booking.status === "cancelled" && (
                          <div className="mt-1 pl-1">
                            <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/30"><XCircle className="h-3 w-3" aria-hidden="true" />Cancelled</Badge>
                          </div>
                        )}
                      </div>
                      {isActive(booking) && (
                        <div className="flex flex-wrap gap-2 mt-2 pl-1">
                          <Button size="sm" variant="outline" onClick={() => addToCalendar(booking)}>
                            <Calendar className="h-3.5 w-3.5 mr-1" /> Add to Calendar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => shareBooking(booking)}>
                            <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
