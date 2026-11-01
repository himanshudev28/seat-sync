import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EventCard } from "./EventCard";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Link } from "react-router-dom";
import { Event } from "@/types";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

type ApiEvent = {
  _id?: string;
  id?: string;
  title?: string;
  description?: string;
  date: string;
  time?: string;
  location?: string;
  price?: number;
  is_free?: boolean;
  image_url?: string;
  total_seats?: number;
  sold_seats?: number;
  category?: string;
};

const normalize = (e: ApiEvent): Event => ({
  id: String(e._id ?? e.id),
  title: e.title ?? "",
  description: e.description ?? "",
  date: e.date,
  time: e.time ?? "",
  location: e.location ?? "",
  price: e.is_free ? 0 : (e.price ?? 0),
  imageUrl: e.image_url ?? "",
  totalSeats: e.total_seats ?? 0,
  availableSeats:
    typeof e.total_seats === "number" && typeof e.sold_seats === "number"
      ? e.total_seats - e.sold_seats
      : 0,
  category: e.category ?? "",
});

async function fetchFeatured(): Promise<Event[]> {
  const res = await fetch("/api/events?featured=true&published=true");
  if (!res.ok) throw new Error("Failed to fetch featured events");
  const data: ApiEvent[] = await res.json();
  return data.map(normalize);
}

/**
 * A horizontal, scroll-snapping rail. Native CSS scroll-snap rather than the
 * embla carousel in ui/: this section is on the eagerly-loaded home page, and
 * scroll-snap costs no JS on that path. Touch swipe, trackpad and keyboard all
 * come from the platform; the arrows are progressive enhancement on top.
 *
 * Cards keep a fixed width so the next one peeks past the edge — the cue that
 * there is more to scroll. When everything already fits, the arrows and the
 * edge fade stay hidden and it reads as a plain row.
 */
function useRail(count: number) {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    // 1px slack: fractional scroll offsets never land exactly on the bound.
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, count]);

  const scrollByPage = useCallback((dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 80% of a screenful keeps a card of overlap so nothing is skipped past.
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: reduced ? "auto" : "smooth" });
  }, []);

  // Everything already fits — no arrows, no fades, reads as a plain row.
  const scrollable = !(atStart && atEnd);

  return { railRef, measure, scrollByPage, atStart, atEnd, scrollable };
}

const ARROW_CLASS =
  "h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-35 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Fixed-width slide so cards stay a consistent size at any count. */
const Slide = ({ children }: { children: React.ReactNode }) => (
  <div className="snap-start shrink-0 w-[78vw] max-w-[300px] sm:w-[300px]">{children}</div>
);

type HeaderProps = {
  /** Rendered only when the rail actually overflows. */
  controls?: React.ReactNode;
};

const SectionHeader = ({ controls }: HeaderProps) => (
  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-5 animate-fadeIn">
    <div>
      <h2 className="font-display text-section tracking-tight text-foreground text-balance">
        On sale now
      </h2>
      <p className="text-muted-foreground mt-2 text-sm md:text-base">
        Seats are live — pick yours before they go.
      </p>
    </div>
    <div className="flex items-center gap-3">
      {controls}
      <Button asChild variant="outline" className="rounded-full font-semibold group">
        <Link to="/events" className="flex items-center gap-2">
          All events
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </Button>
    </div>
  </div>
);

export function FeaturedEvents() {
  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["events", "featured"],
    queryFn: fetchFeatured,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <section className="py-16 md:py-24 bg-background relative overflow-hidden">
        <div className="container max-w-7xl mx-auto px-4 relative z-10">
          <SectionHeader />
          <div className="flex gap-5 overflow-hidden -mx-4 px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Slide key={i}>
                <div
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
                  aria-hidden="true"
                >
                  <Skeleton className="aspect-[16/10] w-full rounded-none bg-surface-elevated" />
                  <div className="flex flex-col gap-3 p-4">
                    <Skeleton className="h-3 w-16 bg-surface-elevated" />
                    <Skeleton className="h-5 w-3/4 bg-surface-elevated" />
                    <Skeleton className="h-4 w-1/2 bg-surface-elevated" />
                    <Skeleton className="h-4 w-2/3 bg-surface-elevated" />
                    <Skeleton className="mt-1 h-11 w-full rounded-xl bg-surface-elevated" />
                  </div>
                </div>
              </Slide>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="relative overflow-hidden bg-background py-16 md:py-24">
        <div className="container relative z-10 mx-auto max-w-7xl px-4">
          <SectionHeader />
          <div
            role="alert"
            className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center"
          >
            <p className="text-muted-foreground">We couldn't load events right now.</p>
            <Button className="h-11 rounded-full px-6" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (events.length === 0) return null;

  return <FeaturedRail events={events} />;
}

/** Split out so the rail hook only runs once there are events to measure. */
function FeaturedRail({ events }: { events: Event[] }) {
  const { railRef, measure, scrollByPage, atStart, atEnd, scrollable } = useRail(events.length);

  return (
    <section className="py-16 md:py-24 bg-background relative overflow-hidden">
      <div className="container max-w-7xl mx-auto px-4 relative z-10">
        <SectionHeader
          controls={
            scrollable && (
              <div className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollByPage(-1)}
                  disabled={atStart}
                  aria-label="Scroll to previous events"
                  className={ARROW_CLASS}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollByPage(1)}
                  disabled={atEnd}
                  aria-label="Scroll to more events"
                  className={ARROW_CLASS}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )
          }
        />

        <div className="relative">
          {/* Fade only on the side that still has content, and keep it narrow
              so it signals "more" without washing out the card underneath. */}
          {scrollable && !atStart && (
            <div className="pointer-events-none absolute inset-y-0 -left-4 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
          )}
          {scrollable && !atEnd && (
            <div className="pointer-events-none absolute inset-y-0 -right-4 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
          )}

          <div
            ref={railRef}
            onScroll={measure}
            role="region"
            aria-label="Events on sale"
            tabIndex={0}
            className="flex gap-5 overflow-x-auto scrollbar-none snap-x snap-mandatory -mx-4 px-4 pb-2 scroll-px-4 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            {events.map((event, index) => (
              <Slide key={event.id}>
                <EventCard event={event} index={index} />
              </Slide>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
