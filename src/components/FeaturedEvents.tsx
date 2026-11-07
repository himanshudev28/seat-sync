import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { EventCard } from "./EventCard";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Event } from "@/types";
import { formatPrice } from "@/lib/utils";
import { imageUrl, imageSrcSet } from "@/lib/img";
import { Tilt } from "./landing/Tilt";
import { useCategories } from "./landing/categories";

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

const longDate = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dayNum = new Intl.DateTimeFormat("en-US", { day: "numeric" });
const monthShort = new Intl.DateTimeFormat("en-US", { month: "short" });

const priceText = (price: number) => (price === 0 ? "Free" : formatPrice(price));

/* ── Header + category chips ─────────────────────────────────────────── */

function CategoryChips() {
  const { data: categories = [] } = useCategories();
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Browse by category" className="flex flex-wrap gap-2 lg:justify-end">
      {categories.map(({ category, count }) => (
        <Link
          key={category}
          to={`/events?category=${encodeURIComponent(category)}`}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none"
        >
          {category}
          <span className="font-mono text-xs tabular-nums text-muted-foreground transition-colors group-hover:text-primary">
            {count}
          </span>
        </Link>
      ))}
      <Link
        to="/events"
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        All events
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </nav>
  );
}

const SectionHeader = () => (
  <div className="mb-12 grid gap-8 lg:mb-16 lg:grid-cols-12 lg:items-end">
    <h2
      id="on-sale-title"
      className="font-display text-[clamp(3.25rem,8vw,6rem)] font-extrabold uppercase leading-[0.84] text-foreground lg:col-span-5"
    >
      On sale <span className="text-primary">now</span>
    </h2>
    <div className="flex flex-col gap-5 lg:col-span-7 lg:items-end lg:text-right">
      <p className="max-w-sm text-pretty text-muted-foreground md:text-lg">
        Seats are live. Pick yours before someone else does.
      </p>
      <CategoryChips />
    </div>
  </div>
);

/* ── Headliner: the first featured event, given the whole stage ─────── */

/** Availability as a strip of seats: lit = still free. */
function SeatStrip({ available, total }: { available: number; total: number }) {
  const SLOTS = 32;
  const lit = Math.round((available / total) * SLOTS);
  const ratio = available / total;
  const status = available === 0 ? "Sold out" : ratio < 0.2 ? "Selling fast" : ratio < 0.5 ? "Going quickly" : "Plenty of seats";
  const tone = available === 0 ? "text-destructive" : ratio < 0.2 ? "text-warning" : "text-success";

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-4 text-sm">
        <span className={`font-semibold ${tone}`}>{status}</span>
        <span className="text-muted-foreground">
          <span className="font-mono font-bold text-foreground">{available}</span> of {total} seats left
        </span>
      </div>
      <div className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: SLOTS }, (_, i) => (
          <span
            key={i}
            className={`h-3 flex-1 rounded-t-[4px] rounded-b-[2px] ${i < lit ? "bg-seat-standard" : "bg-foreground/10"}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * No artwork (or it won't load): set the event as a gig poster instead of
 * showing an empty tile. Built from the event's own words, so it always fits.
 */
function PosterFallback({ title, category, location }: { title: string; category: string; location: string }) {
  return (
    <div className="lp-ink absolute inset-0 flex flex-col justify-end overflow-hidden p-7 pb-16">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 80% 10%, hsl(var(--lp-glow) / 0.55), transparent 60%), radial-gradient(ellipse 70% 50% at 0% 100%, rgb(var(--seat-premium) / 0.35), transparent 70%)",
        }}
      />
      <div aria-hidden="true" className="lp-dots absolute inset-0 opacity-60" />
      <p className="relative mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[hsl(var(--lp-glow))]">
        {category || "Live"}
      </p>
      <p className="relative font-display text-[clamp(3rem,7vw,4.75rem)] font-extrabold uppercase leading-[0.82] text-balance">
        {title}
      </p>
      <p className="lp-ink-muted relative mt-4 text-sm">{location}</p>
    </div>
  );
}

function Headliner({ event }: { event: Event }) {
  const [broken, setBroken] = useState(false);
  const { id, title, description, date, time, location, price, imageUrl: src, totalSeats, availableSeats, category } = event;
  const img = src && !broken ? src : null;
  const when = new Date(date);
  const hasSeats = totalSeats > 0;
  const soldOut = hasSeats && availableSeats === 0;

  return (
    <article aria-labelledby={`headliner-${id}`} className="relative isolate grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
      {/* The event's own artwork, blurred into ambient light behind it. */}
      {img && (
        <div aria-hidden="true" className="pointer-events-none absolute -inset-16 -z-10 opacity-30 [mask-image:radial-gradient(closest-side,#000_35%,transparent)] dark:opacity-25">
          <img
            src={imageUrl(img, 320)}
            alt=""
            referrerPolicy="no-referrer"
            data-no-dim
            className="h-full w-full object-cover blur-3xl saturate-150"
            onError={() => setBroken(true)}
          />
        </div>
      )}

      <Link to={`/events/${id}`} tabIndex={-1} aria-hidden="true" className="block lg:col-span-5">
        <Tilt max={7} className="rounded-[1.75rem]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-border/60 bg-accent shadow-[0_50px_90px_-40px_rgb(0_0_0/0.55)]">
            {img ? (
              <img
                src={imageUrl(img, 800)}
                srcSet={imageSrcSet(img, [480, 640, 800, 1000])}
                sizes="(min-width: 1024px) 40vw, 100vw"
                alt=""
                // Many poster hosts refuse hotlinks (403 when a Referer is sent).
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                onError={() => setBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <PosterFallback title={title} category={category} location={location} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="absolute left-5 top-5 rounded-2xl bg-background/90 px-4 py-2.5 text-center shadow-lg backdrop-blur-md">
              <div className="font-display text-4xl font-extrabold leading-none text-foreground">{dayNum.format(when)}</div>
              <div className="mt-0.5 text-xs font-bold uppercase tracking-wider text-primary">{monthShort.format(when)}</div>
            </div>
          </div>
        </Tilt>
      </Link>

      <div className="flex flex-col gap-6 lg:col-span-7">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground">Headliner</span>
          {category && <span className="font-semibold uppercase tracking-wider text-muted-foreground">{category}</span>}
        </div>

        <h3
          id={`headliner-${id}`}
          className="font-display text-[clamp(2.75rem,6.5vw,5.25rem)] font-extrabold uppercase leading-[0.86] text-foreground text-balance"
        >
          <Link to={`/events/${id}`} className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {title}
          </Link>
        </h3>

        {description && <p className="line-clamp-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">{description}</p>}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-5 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs text-muted-foreground">When</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {longDate.format(when)}
              {time && <span className="block text-sm font-normal text-muted-foreground">{time}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Where</dt>
            <dd className="mt-1 font-semibold text-foreground">{location}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tickets from</dt>
            <dd className="mt-1 font-mono text-2xl font-bold text-foreground">{priceText(price)}</dd>
          </div>
        </dl>

        {hasSeats && <SeatStrip available={availableSeats} total={totalSeats} />}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            to={`/events/${id}`}
            aria-disabled={soldOut || undefined}
            className="group inline-flex h-14 items-center gap-3 rounded-full bg-primary pl-7 pr-2 text-base font-semibold text-primary-foreground shadow-[0_14px_40px_-14px_hsl(var(--primary)/0.7)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
          >
            {soldOut ? "See event" : "Pick your seat"}
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/15 transition-transform duration-300 group-hover:-rotate-45 motion-reduce:transform-none">
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ── More on sale: a scroll-snapping rail ─────────────────────────────── */

/**
 * Native CSS scroll-snap rather than the embla carousel in ui/: this is the
 * eagerly loaded home page and scroll-snap costs no JS. Touch, trackpad and
 * keyboard come from the platform; the arrows are progressive enhancement.
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

  return { railRef, measure, scrollByPage, atStart, atEnd, scrollable: !(atStart && atEnd) };
}

const ARROW_CLASS =
  "h-11 w-11 rounded-full border border-border bg-card flex items-center justify-center text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-35 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function MoreRail({ events }: { events: Event[] }) {
  const { railRef, measure, scrollByPage, atStart, atEnd, scrollable } = useRail(events.length);

  return (
    <div className="mt-20 md:mt-28">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h3 className="font-display text-3xl font-extrabold uppercase text-foreground md:text-4xl">More on sale</h3>
        {scrollable && (
          <div className="hidden items-center gap-2 md:flex">
            <button type="button" onClick={() => scrollByPage(-1)} disabled={atStart} aria-label="Scroll to previous events" className={ARROW_CLASS}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => scrollByPage(1)} disabled={atEnd} aria-label="Scroll to more events" className={ARROW_CLASS}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={railRef}
        onScroll={measure}
        role="region"
        aria-label="More events on sale"
        tabIndex={0}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 py-4 scrollbar-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {events.map((event, index) => (
          <div key={event.id} className="w-[78vw] max-w-[300px] shrink-0 snap-start sm:w-[300px]">
            <Tilt max={5} className="h-full rounded-2xl">
              <EventCard event={event} index={index} />
            </Tilt>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────────── */

function HeadlinerSkeleton() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16" aria-hidden="true">
      <Skeleton className="aspect-[4/5] w-full rounded-[1.75rem] bg-surface-elevated lg:col-span-5" />
      <div className="flex flex-col gap-5 lg:col-span-7">
        <Skeleton className="h-7 w-40 rounded-full bg-surface-elevated" />
        <Skeleton className="h-20 w-4/5 bg-surface-elevated" />
        <Skeleton className="h-16 w-full bg-surface-elevated" />
        <Skeleton className="h-20 w-full bg-surface-elevated" />
        <Skeleton className="h-14 w-52 rounded-full bg-surface-elevated" />
      </div>
    </div>
  );
}

export function FeaturedEvents() {
  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["events", "featured"],
    queryFn: fetchFeatured,
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby="on-sale-title" className="relative overflow-hidden py-16 md:py-24">
      <div className="container mx-auto max-w-7xl px-4">
        <SectionHeader />

        {isLoading ? (
          <HeadlinerSkeleton />
        ) : isError ? (
          <div role="alert" className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-10 text-center">
            <p className="text-muted-foreground">We couldn't load events right now.</p>
            <Button className="h-11 rounded-full px-6" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center md:p-16">
            <p className="font-display text-3xl font-extrabold uppercase text-foreground">The stage is being set</p>
            <p className="mt-2 text-muted-foreground">Nothing is on sale right now. New events are added all the time.</p>
            <Button asChild variant="outline" className="mt-6 h-11 rounded-full px-6">
              <Link to="/events">See all events</Link>
            </Button>
          </div>
        ) : (
          <>
            <Headliner event={events[0]} />
            {events.length > 1 && <MoreRail events={events.slice(1)} />}
          </>
        )}
      </div>
    </section>
  );
}
