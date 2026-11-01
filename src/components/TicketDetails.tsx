
import { memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, CheckCircle2, XCircle, Clock, MapPin, CalendarDays } from "lucide-react";
import { formatPrice } from "@/lib/utils";

type TicketProps = {
  booking: {
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
};

const TicketDetails = ({ booking }: TicketProps) => {
  const navigate = useNavigate();
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      console.error("Error formatting date:", error, dateString);
      return "Invalid date";
    }
  };

  const formatSeats = (seats: { row: string; number: number }[]) => {
    if (!seats.length) return "No seat information";
    
    return seats
      .sort((a, b) => {
        if (a.row === b.row) {
          return a.number - b.number;
        }
        return a.row.localeCompare(b.row);
      })
      .map((seat) => `${seat.row}${seat.number}`)
      .join(", ");
  };

  const statusMeta =
    booking.status === "confirmed"
      ? { Icon: CheckCircle2, cls: "bg-success/10 text-success border-success/30" }
      : booking.status === "cancelled"
      ? { Icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" }
      : { Icon: Clock, cls: "bg-warning/10 text-warning border-warning/30" };
  const StatusIcon = statusMeta.Icon;
  const seatLabel = formatSeats(booking.seats);

  return (
    <article
      key={booking.id}
      className="flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-border bg-card text-card-foreground"
    >
      {/* Thumbnail / fallback */}
      <div className="flex items-center justify-center bg-accent text-accent-foreground sm:w-28 py-4 sm:py-0">
        <Ticket className="h-8 w-8" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-display text-card-title truncate max-w-full">
            {booking.event?.title || "Unknown Event"}
          </h3>
          <Badge variant="outline" className={`gap-1 ${statusMeta.cls}`}>
            <StatusIcon className="h-3 w-3" aria-hidden="true" />
            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
          </Badge>
        </div>

        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          {booking.event?.date && (
            <p className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
              {formatDate(booking.event.date)}
            </p>
          )}
          {booking.event?.location && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{booking.event.location}</span>
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-dashed border-border pt-3">
          <div>
            <p className="text-label text-muted-foreground">Seats</p>
            <p className="text-data font-mono">{seatLabel}</p>
          </div>
          <div className="text-right">
            {booking.is_free ? (
              <p className="text-data font-mono text-success">Free</p>
            ) : booking.total_price > 0 ? (
              <p className="text-data font-mono">{formatPrice(booking.total_price)}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">Booked {formatDate(booking.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Navigation is a link, not a button. */}
          <Button asChild variant="secondary" size="sm">
            <Link to={`/events/${booking.event_id}`} aria-label={`View event: ${booking.event?.title || "event"}`}>
              View Event
            </Link>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate(`/generate-ticket/${booking.id}`)}
          >
            Generate Ticket
          </Button>
        </div>
      </div>
    </article>
  );
};

export default memo(TicketDetails);
