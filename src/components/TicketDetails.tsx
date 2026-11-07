import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, QrCode } from "lucide-react";
import { compareRows, formatPrice } from "@/lib/utils";
import { timeOf } from "./ticket/ticketData";
import "./ticket/ticket.css";

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
      time?: string;
      category?: string;
    };
    seats: {
      row: string;
      number: number;
    }[];
  };
  /** Extra controls under the card (outside the link, so they stay separate buttons). */
  actions?: React.ReactNode;
};

const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", o).format(d);

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-[#34d399]/15 text-[#34d399]" },
  pending: { label: "Pending", cls: "bg-[#fbbf24]/15 text-[#fbbf24]" },
  cancelled: { label: "Cancelled", cls: "bg-[#f87171]/15 text-[#f87171]" },
  refunded: { label: "Refunded", cls: "bg-[#f87171]/15 text-[#f87171]" },
};

/**
 * A booking in My Tickets, drawn as a ticket stub. The whole card opens the
 * full ticket (QR, flip, downloads) at /tickets/:id.
 */
const TicketDetails = ({ booking, actions }: TicketProps) => {
  const { event } = booking;
  const when = event?.date ? new Date(event.date) : null;
  const valid = when && !Number.isNaN(when.getTime());
  const seats = [...booking.seats].sort((a, b) => compareRows(a.row, b.row) || a.number - b.number);
  const status = STATUS[booking.status] ?? { label: booking.status, cls: "bg-white/10 text-white" };
  const price = booking.is_free ? "Free" : booking.total_price > 0 ? formatPrice(booking.total_price) : "";
  const title = event?.title || "Unknown event";
  const seatText = seats.map((s) => `${s.row}${s.number}`).join(", ");
  // The link's name is all a screen reader hears for the card, so it carries the essentials.
  const label = [
    `Open ticket: ${title}`,
    valid ? part(when, { dateStyle: "medium" }) : null,
    status.label,
    seatText ? `seats ${seatText}` : null,
    price || null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="group">
      <div className="tk-mini-shadow">
        <Link
          to={`/tickets/${booking.id}`}
          aria-label={label}
          // The notch mask clips anything drawn outside the card, so the focus ring is an inset outline.
          className="tk-mini flex overflow-hidden rounded-[1.25rem] bg-[#15110f] text-white ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-[#ff7a6b] motion-reduce:transform-none"
        >
          {/* Date block */}
          <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-primary px-2 py-4 text-primary-foreground sm:w-24">
            {valid ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider">{part(when, { weekday: "short" })}</span>
                <span className="font-display text-5xl font-extrabold leading-[0.9]">{part(when, { day: "numeric" })}</span>
                <span className="text-xs font-bold uppercase tracking-wider">{part(when, { month: "short" })}</span>
              </>
            ) : (
              <QrCode className="h-8 w-8" aria-hidden="true" />
            )}
          </div>

          {/* Main */}
          <div className="relative min-w-0 flex-1 p-4 sm:p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse 60% 90% at 100% 0%, rgb(255 107 91 / 0.22), transparent 70%)" }}
            />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${status.cls}`}>{status.label}</span>
                {event?.category && (
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff7a6b]">{event.category}</span>
                )}
              </div>
              <h3 className="mt-2 truncate font-display text-2xl font-extrabold uppercase leading-[0.95] sm:text-3xl">{title}</h3>
              <p className="mt-1 truncate text-sm text-white/65">
                {[event?.location, event?.time || timeOf(event?.date), valid ? part(when, { year: "numeric" }) : null].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {seats.length > 0 ? (
                  seats.slice(0, 8).map((s) => (
                    <span
                      key={`${s.row}-${s.number}`}
                      className="rounded-t-lg rounded-b-md bg-white/10 px-2 py-0.5 font-mono text-xs font-bold ring-1 ring-inset ring-white/20"
                    >
                      {s.row}
                      {s.number}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/65">No seat information</span>
                )}
                {seats.length > 8 && <span className="text-xs text-white/65">+{seats.length - 8} more</span>}
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#ff7a6b] sm:hidden">
                View ticket <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
          </div>

          {/* Stub */}
          <div className="hidden w-36 shrink-0 flex-col items-center justify-center gap-2 border-l-2 border-dashed border-black/20 bg-[#fbf7f3] p-4 text-center text-[#15110f] sm:flex">
            <QrCode className="h-10 w-10 transition-transform duration-300 group-hover:scale-110 motion-reduce:transform-none" aria-hidden="true" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">View ticket</span>
            {price && <span className="font-mono text-sm font-bold">{price}</span>}
          </div>
        </Link>
      </div>
      {actions && <div className="mt-2.5 flex flex-wrap gap-2 pl-1">{actions}</div>}
    </article>
  );
};

export default memo(TicketDetails);
