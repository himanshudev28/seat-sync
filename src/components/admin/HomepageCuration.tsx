import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EventCard } from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Event } from "@/types";
import { ExternalLink, Star, Sparkles, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils";

/** Only two spotlight cards fit over the hero image — mirrors the server cap. */
const SPOTLIGHT_LIMIT = 2;
/** How many featured cards the home page rail carries. */
const FEATURED_LIMIT = 12;

type AdminEvent = {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  price?: number;
  is_free?: boolean;
  image_url?: string | null;
  category?: string;
  total_seats?: number;
  sold_seats?: number;
  is_published?: boolean;
  is_featured?: boolean;
  is_spotlight?: boolean;
};

/** Shape an admin event into what the public EventCard renders, so the preview
 *  is the real card rather than a lookalike that can drift from it. */
function toPublicEvent(e: AdminEvent): Event {
  const total = e.total_seats ?? 0;
  const sold = e.sold_seats ?? 0;
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? "",
    date: e.date,
    time: "",
    location: e.location ?? "",
    price: e.is_free ? 0 : e.price ?? 0,
    imageUrl: e.image_url ?? "",
    totalSeats: total,
    availableSeats: Math.max(0, total - sold),
    category: e.category ?? "",
  };
}

const isUpcoming = (e: AdminEvent) => new Date(e.date).getTime() >= Date.now();

type Props = {
  events: AdminEvent[];
  onToggle: (eventId: string, flag: "featured" | "spotlight") => void | Promise<void>;
  pendingId: string | null;
};

export function HomepageCuration({ events, onToggle, pendingId }: Props) {
  const [query, setQuery] = useState("");

  // Only published, upcoming events can reach the home page — the same rule the
  // public API applies. Showing the rest as togglable would be a lie.
  const eligible = useMemo(
    () => events.filter((e) => e.is_published && isUpcoming(e)),
    [events]
  );

  const ineligibleCount = events.length - eligible.length;

  const featured = useMemo(() => eligible.filter((e) => e.is_featured), [eligible]);
  const spotlight = useMemo(() => eligible.filter((e) => e.is_spotlight), [eligible]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q) ||
        (e.category ?? "").toLowerCase().includes(q)
    );
  }, [eligible, query]);

  const spotlightFull = spotlight.length >= SPOTLIGHT_LIMIT;

  return (
    <div className="space-y-8">

      {/* ── What this page controls ─────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-section text-foreground">Home page</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which events appear in the "On sale now" row and over the hero image.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl self-start sm:self-auto">
          <Link to="/" className="flex items-center gap-2">
            View home page
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {eligible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Star className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="font-semibold text-foreground">No events can be featured yet</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Only published events with a future date can appear on the home page. Publish an
            upcoming event on the Events tab and it will show up here.
          </p>
        </div>
      ) : (
        <>
          {/* ── Current state, as the visitor sees it ──────────── */}
          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                On sale now
              </h3>
              <p className="text-sm text-muted-foreground">
                {featured.length === 0
                  ? `Nothing picked — showing the ${FEATURED_LIMIT} soonest events`
                  : `${featured.length} of ${FEATURED_LIMIT} slots used`}
              </p>
            </div>

            {featured.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground text-center">
                Pick events below to control this row. Until then the home page falls back to the
                soonest upcoming events, so it's never empty.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {featured.slice(0, FEATURED_LIMIT).map((e, i) => (
                  <EventCard key={e.id} event={toPublicEvent(e)} index={i} />
                ))}
              </div>
            )}

            {featured.length > FEATURED_LIMIT && (
              <p className="flex items-center gap-2 text-sm text-warning">
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {featured.length - FEATURED_LIMIT} picked{" "}
                {featured.length - FEATURED_LIMIT === 1 ? "event won't" : "events won't"} fit — the
                row shows the {FEATURED_LIMIT} soonest.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" aria-hidden="true" />
                Hero spotlight
              </h3>
              <p className="text-sm text-muted-foreground">
                {spotlight.length} of {SPOTLIGHT_LIMIT} cards
              </p>
            </div>

            {spotlight.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground text-center">
                The two cards over the hero image fall back to the soonest upcoming events.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                {spotlight.map((e) => (
                  <div key={e.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-foreground leading-tight">{e.title}</p>
                      <Badge variant="secondary" className="flex-shrink-0">Spotlight</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{e.location}</p>
                    <p className="text-sm font-bold text-foreground mt-2">
                      {e.is_free || !e.price ? "Free" : formatPrice(e.price)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── The picker ─────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-foreground">
                Eligible events
                <span className="ml-2 font-normal text-sm text-muted-foreground">
                  published and upcoming
                </span>
              </h3>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events"
                className="sm:max-w-xs"
                aria-label="Search eligible events"
              />
            </div>

            {ineligibleCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {ineligibleCount} {ineligibleCount === 1 ? "event is" : "events are"} hidden here
                because {ineligibleCount === 1 ? "it is" : "they are"} unpublished or already past.
              </p>
            )}

            {visible.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground text-center">
                No events match "{query}".
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                {visible.map((e) => {
                  const spotlightBusy = pendingId === `${e.id}:spotlight`;
                  const featuredBusy = pendingId === `${e.id}:featured`;
                  // Blocked only when the cap is full AND this one isn't in it.
                  const spotlightBlocked = spotlightFull && !e.is_spotlight;
                  return (
                    <li key={e.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between transition-colors ${e.is_featured || e.is_spotlight ? "bg-accent/40" : ""}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(e.date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.category ? ` · ${e.category}` : ""}
                        </p>
                        {(e.is_featured || e.is_spotlight) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {e.is_featured && <Badge variant="secondary">Featured</Badge>}
                            {e.is_spotlight && <Badge variant="secondary">Spotlight</Badge>}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-6 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`featured-${e.id}`}
                            checked={!!e.is_featured}
                            aria-label={`Feature ${e.title}`}
                            disabled={featuredBusy}
                            onCheckedChange={() => onToggle(e.id, "featured")}
                          />
                          <Label htmlFor={`featured-${e.id}`} className="text-sm cursor-pointer">
                            Featured
                          </Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            id={`spotlight-${e.id}`}
                            checked={!!e.is_spotlight}
                            aria-label={`Spotlight ${e.title}`}
                            disabled={spotlightBusy || spotlightBlocked}
                            onCheckedChange={() => onToggle(e.id, "spotlight")}
                          />
                          <Label
                            htmlFor={`spotlight-${e.id}`}
                            className={`text-sm cursor-pointer ${spotlightBlocked ? "text-muted-foreground" : ""}`}
                            title={spotlightBlocked ? `Both spotlight cards are taken` : undefined}
                          >
                            Spotlight
                          </Label>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
