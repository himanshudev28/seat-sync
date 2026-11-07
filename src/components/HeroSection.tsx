import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Armchair, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { imageUrl } from "@/lib/img";
import { useAuth } from "@/providers/AuthProvider";
import { VenueScene } from "./landing/VenueScene";

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

const priceLabel = (e: SpotlightEvent) => (e.is_free || !e.price ? "Free" : formatPrice(e.price));

const TRUST = [
  { icon: Armchair, label: "Live seat maps" },
  { icon: Zap, label: "Instant confirmation" },
  { icon: ShieldCheck, label: "Secure checkout" },
];

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** A real, clickable event (chosen in Admin → Home page) floating over the venue. */
function SpotlightCard({ event, className }: { event: SpotlightEvent; className?: string }) {
  // Admins can paste any image URL; hotlink-protected or http images fail, so
  // fall back to a plain tile rather than a broken-image icon.
  const [broken, setBroken] = useState(false);
  const src = event.image_url && !broken ? event.image_url : null;

  return (
    <Link
      to={`/events/${event.id}`}
      className={`group flex items-center gap-3 rounded-2xl border border-border/80 bg-card/95 p-2.5 pr-4 text-left shadow-[0_24px_60px_-24px_rgb(0_0_0/0.45)] backdrop-blur-md transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className ?? ""}`}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-accent">
        {src ? (
          <img
            src={imageUrl(src, 160)}
            alt=""
            referrerPolicy="no-referrer"
            width={64}
            height={64}
            loading="eager"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-2xl font-extrabold text-primary">
            {event.title.charAt(0)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-primary">{dateFmt.format(new Date(event.date))}</p>
        <p className="truncate font-display text-xl font-bold uppercase leading-tight text-foreground">
          {event.title}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{event.location}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono font-bold text-foreground">{priceLabel(event)}</span>
        </p>
      </div>
      <ArrowRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export function HeroSection() {
  const { user } = useAuth();
  const { data: spotlight = [] } = useQuery({
    queryKey: ["events", "spotlight"],
    queryFn: fetchSpotlight,
    staleTime: 60_000,
  });
  const [lead, second] = spotlight;
  // main.tsx sets data-booted when the static first-paint hero was on screen, so this copy doesn't
  // replay its entrance. That only applies to the first load: clear it when the hero leaves.
  useEffect(() => () => document.documentElement.removeAttribute("data-booted"), []);

  return (
    // Pulled up under the floating header so the stage light reaches the top edge.
    <section aria-labelledby="hero-title" className="relative isolate -mt-20 overflow-hidden pt-20">
      {/* ── Lighting rig ─────────────────────────────────────── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="lp-hero-glow absolute inset-0" />
        <div className="lp-dots absolute inset-0" />
        <span className="lp-beam" style={{ left: "48%", "--from": "-16deg", "--to": "2deg", "--d": "-3s" } as Vars} />
        <span className="lp-beam" style={{ left: "66%", "--from": "12deg", "--to": "-6deg", "--d": "-6s" } as Vars} />
        <span className="lp-beam" style={{ left: "84%", "--from": "-2deg", "--to": "14deg" } as Vars} />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="container mx-auto max-w-7xl px-4">
        <div className="grid items-center gap-y-4 pb-24 pt-8 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-12 lg:gap-x-4 lg:pb-28 lg:pt-4">
          {/* ── Copy ─────────────────────────────────────────────── */}
          <div className="relative z-20 flex flex-col gap-7 lg:col-span-5">
            {/* Space is held for the pill before the spotlight loads, so its arrival doesn't push
                the headline and venue down (it was the page's biggest layout shift). */}
            <div className="flex min-h-[2.25rem] items-center">
            {lead && (
              <Link
                to={`/events/${lead.id}`}
                className="lp-in group inline-flex w-fit max-w-full items-center gap-2.5 rounded-full border border-border bg-card/80 py-1.5 pl-3 pr-4 text-sm shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="shrink-0 text-muted-foreground">Now booking</span>
                <span className="truncate font-semibold text-foreground">{lead.title}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            )}
            </div>

            <h1 id="hero-title" className="lp-hero-title font-display uppercase text-foreground">
              <span className="lp-line">
                <span style={{ "--i": 0 } as Vars}>
                  The <span className="text-primary">best seat</span>
                </span>
              </span>
              <span className="lp-line">
                <span style={{ "--i": 1 } as Vars}>in the house</span>
              </span>
              <span className="lp-line">
                <span style={{ "--i": 2 } as Vars}>is yours.</span>
              </span>
            </h1>

            <p
              className="lp-in max-w-md text-pretty text-lg leading-relaxed text-muted-foreground"
              style={{ "--d": "380ms" } as Vars}
            >
              Concerts, matches, theatre and more. See the live seat map, tap the exact seat you want,
              and your ticket lands in seconds.
            </p>

            <div className="lp-in flex flex-col gap-3 sm:flex-row" style={{ "--d": "480ms" } as Vars}>
              <Link
                to="/events"
                className="group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-primary pl-7 pr-2 text-base font-semibold text-primary-foreground shadow-[0_14px_40px_-12px_hsl(var(--primary)/0.65)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-12px_hsl(var(--primary)/0.75)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
              >
                Browse events
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/15 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-rotate-45 motion-reduce:transform-none">
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </span>
              </Link>
              <Link
                to={user ? "/tickets" : "/auth"}
                className="inline-flex h-14 items-center justify-center rounded-full border border-border bg-card/70 px-7 text-base font-semibold text-foreground backdrop-blur-sm transition-colors duration-200 hover:border-foreground/30 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {user ? "My tickets" : "Create free account"}
              </Link>
            </div>

            <ul
              className="lp-in flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm text-muted-foreground"
              style={{ "--d": "580ms" } as Vars}
            >
              {TRUST.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* ── The venue ────────────────────────────────────────── */}
          <div className="lp-venue-scroll relative -mx-4 sm:mx-0 lg:col-span-7 lg:-mr-10 xl:-mr-20">
            <VenueScene />

            {lead && (
              <div className="lp-float absolute bottom-[4%] left-[-2%] hidden lg:block" style={{ "--depth": "-18px" } as Vars}>
                <div className="lp-bob">
                  <SpotlightCard event={lead} className="w-72" />
                </div>
              </div>
            )}
            {second && (
              <div className="lp-float absolute right-[8%] top-[-2%] hidden lg:block" style={{ "--depth": "14px" } as Vars}>
                <div className="lp-bob" style={{ "--d": "-3s" } as Vars}>
                  <SpotlightCard event={second} className="w-64" />
                </div>
              </div>
            )}
          </div>

          {/* Phones and tablets: the spotlight sits under the venue instead of over it. */}
          {lead && (
            <div className="flex flex-col gap-3 sm:flex-row lg:hidden">
              <SpotlightCard event={lead} className="sm:flex-1" />
              {second && <SpotlightCard event={second} className="sm:flex-1" />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
