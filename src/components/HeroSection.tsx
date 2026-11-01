import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, MapPin } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { imageUrl, imageSrcSet, SIZES, WIDTHS } from "@/lib/img";

const TRUST_ITEMS = ["Live seat maps", "Instant confirmation", "Secure checkout"];

/** Used when no event has an image of its own, or that image won't load. */
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14";

type SpotlightEvent = {
  id: string;
  title: string;
  date: string;
  location: string;
  price: number;
  is_free: boolean;
  image_url: string | null;
};

async function fetchSpotlight(): Promise<SpotlightEvent[]> {
  const res = await fetch("/api/events?spotlight=true&published=true");
  if (!res.ok) throw new Error("Failed to load spotlight events");
  const data = await res.json();
  return (data as (SpotlightEvent & { _id?: string })[]).map((e) => ({
    ...e,
    id: String(e.id ?? e._id),
  }));
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const priceLabel = (e: SpotlightEvent) =>
  e.is_free || !e.price ? "Free" : formatPrice(e.price);

/** A real, clickable event card floating over the hero image. */
function SpotlightCard({ event, className }: { event: SpotlightEvent; className: string }) {
  return (
    <Link
      to={`/events/${event.id}`}
      className={`group absolute w-60 rounded-2xl border border-border bg-background/90 backdrop-blur-xl p-4 shadow-xl transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      <p className="text-sm font-bold text-foreground leading-tight line-clamp-2 mb-2">
        {event.title}
      </p>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-primary/70 flex-shrink-0" />
          {dateFmt.format(new Date(event.date))}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-primary/70 flex-shrink-0" />
          <span className="truncate">{event.location}</span>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-foreground">{priceLabel(event)}</span>
        <span className="text-xs text-primary font-semibold flex items-center gap-1">
          Book now
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function HeroSection() {
  const { data: spotlight = [] } = useQuery({
    queryKey: ["events", "spotlight"],
    queryFn: fetchSpotlight,
    staleTime: 60_000,
  });
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  // The hero image is the lead event's own artwork when it has one — real
  // product content beats a stock photo.
  //
  // But an admin can paste any URL, and plenty of image hosts refuse
  // cross-origin requests (hotlink protection returns 403 once the browser
  // attaches a Referer) or are plain http, which an https deployment blocks as
  // mixed content. Either way the swap from the stock photo to the event's
  // artwork used to leave a broken-image icon sitting in the hero, so fall
  // back the moment the load fails.
  const eventSrc = spotlight.find((e) => e.image_url)?.image_url;
  const heroSrc = eventSrc && eventSrc !== brokenSrc ? eventSrc : FALLBACK_IMAGE;

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-background">
      {/* ── Ambient background ────────────────────────────────── */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40 dark:opacity-60 pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[800px] h-[500px] rounded-full bg-primary/8 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-primary/5 blur-[100px] pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-4 py-24 md:py-32 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 items-center">

          {/* ── Left: Copy ───────────────────────────────────────── */}
          <div className="flex flex-col gap-7 lg:col-span-3">
            <h1
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-balance animate-fadeIn"
              style={{ animationDelay: "0ms" }}
            >
              Book events{" "}
              <span className="text-primary">you'll love,</span>
              <br />
              seats you'll remember.
            </h1>

            <p
              className="text-lg text-muted-foreground max-w-lg leading-relaxed animate-fadeIn"
              style={{ animationDelay: "60ms" }}
            >
              Discover concerts, sports, theatre and more. Pick your exact seat on a live map and
              your ticket lands in seconds.
            </p>

            <div
              className="flex flex-col sm:flex-row gap-3 animate-fadeIn"
              style={{ animationDelay: "120ms" }}
            >
              <Link
                to="/events"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-full px-6 py-3 text-sm font-semibold shadow-md shadow-primary/25 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all duration-200"
              >
                Browse Events
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background/70 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted/60 hover:border-primary/30 active:scale-95 transition-all duration-200"
              >
                Create free account
              </Link>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 animate-fadeIn"
              style={{ animationDelay: "180ms" }}
            >
              {TRUST_ITEMS.map((label) => (
                <span key={label} className="text-sm text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right: Visual ────────────────────────────────────── */}
          <div
            className="relative hidden lg:flex flex-col gap-4 items-end animate-fadeInScale lg:col-span-2"
            style={{ animationDelay: "100ms" }}
          >
            <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-2xl">
              <img
                // Keyed on the source so React remounts (and re-runs onError)
                // when the hero swaps from the stock photo to event artwork.
                key={heroSrc}
                src={imageUrl(heroSrc, 960)}
                srcSet={imageSrcSet(heroSrc, [...WIDTHS.hero])}
                sizes={SIZES.hero}
                alt=""
                width={800}
                height={500}
                className="w-full aspect-[16/10] object-cover"
                loading="eager"
                decoding="async"
                onError={() => setBrokenSrc(heroSrc)}
                // React 18 doesn't map the camelCase prop; the lowercase
                // attribute is what actually reaches the DOM.
                {...{ fetchpriority: "high" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>

            {/* Real events, chosen in Admin → Home page. Nothing renders until
                they load, rather than showing invented placeholders. */}
            {spotlight[0] && (
              <SpotlightCard event={spotlight[0]} className="-left-8 top-8 animate-float" />
            )}
            {spotlight[1] && (
              <SpotlightCard
                event={spotlight[1]}
                className="-right-6 bottom-12 animate-float [animation-delay:0.8s]"
              />
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
