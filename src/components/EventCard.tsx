import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import {
  Calendar,
  MapPin,
  Heart,
  Zap,
  ArrowRight,
  Ticket,
  Music,
  Trophy,
  Drama,
  Presentation,
  PartyPopper,
  Smile,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { Event } from "@/types";
import { formatPrice } from "@/lib/utils";
import { imageUrl as sizedImage, imageSrcSet, SIZES, WIDTHS } from "@/lib/img";

// Module-scope formatter (date-fns removed from the always-loaded bundle).
// Reproduces date-fns "EEE, d MMM" in en-US, e.g. "Sat, 12 Dec".
const dateParts = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const formatShortDate = (d: Date): string => {
  const p = Object.fromEntries(dateParts.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.day} ${p.month}`;
};

/** Port of date-fns formatDistanceToNow(d, { addSuffix: true }) (en-US wording). */
const formatRelative = (d: Date, now = Date.now()): string => {
  const diff = d.getTime() - now;
  const minutes = Math.round(Math.abs(diff) / 60000);
  let text: string;
  if (minutes < 2) text = minutes === 0 ? "less than a minute" : "1 minute";
  else if (minutes < 45) text = `${minutes} minutes`;
  else if (minutes < 90) text = "about 1 hour";
  else if (minutes < 1440) text = `about ${Math.round(minutes / 60)} hours`;
  else if (minutes < 2520) text = "1 day";
  else if (minutes < 43200) text = `${Math.round(minutes / 1440)} days`;
  else if (minutes < 86400) text = `about ${Math.round(minutes / 43200)} months`;
  else {
    const months = Math.floor(minutes / 43200.0 / (365.25 / 12 / 30));
    if (months < 12) text = `${Math.round(minutes / 43200)} months`;
    else {
      const years = Math.floor(months / 12);
      const rem = months % 12;
      text =
        rem < 3
          ? `about ${years} year${years === 1 ? "" : "s"}`
          : rem < 9
            ? `over ${years} year${years === 1 ? "" : "s"}`
            : `almost ${years + 1} years`;
    }
  }
  return diff < 0 ? `${text} ago` : `in ${text}`;
};

interface EventCardProps {
  event: Event;
  index?: number;
  bookmarked?: boolean;
  onToggleBookmark?: (id: string) => void;
}

/** Category -> icon. Matching is by substring so "Concerts" and "Concert" both land. */
const CATEGORY_ICONS: [string, LucideIcon][] = [
  ["concert", Music],
  ["music", Music],
  ["sport", Trophy],
  ["theat", Drama],
  ["conference", Presentation],
  ["festival", PartyPopper],
  ["comedy", Smile],
  ["exhib", Palette],
  ["art", Palette],
];

const categoryIcon = (category: string): LucideIcon => {
  const c = category.toLowerCase();
  return CATEGORY_ICONS.find(([key]) => c.includes(key))?.[1] ?? Ticket;
};

/** Token-only tints; a category always maps to the same one. */
const TINTS = [
  "from-primary/35 via-primary/15 to-primary/5",
  "from-success/35 via-success/15 to-success/5",
  "from-warning/35 via-warning/15 to-warning/5",
  "from-destructive/30 via-destructive/12 to-destructive/5",
];

const tintFor = (category: string) => {
  let h = 0;
  for (let i = 0; i < category.length; i++)
    h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
};

/**
 * Shown when an event has no image (or it fails to load). Exported so the
 * event detail page uses the very same fallback.
 */
export function EventImageFallback({
  category,
  large = false,
}: {
  category: string;
  large?: boolean;
}) {
  const Icon = categoryIcon(category);
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br ${tintFor(
        category,
      )} bg-surface-secondary`}
      aria-hidden="true"
    >
      <div
        className={`flex items-center justify-center rounded-2xl bg-background/60 backdrop-blur-sm border border-border text-foreground ${
          large ? "h-20 w-20" : "h-14 w-14"
        }`}
      >
        <Icon className={large ? "h-10 w-10" : "h-7 w-7"} />
      </div>
      {category && (
        <span className="text-label uppercase text-foreground/80">
          {category}
        </span>
      )}
    </div>
  );
}

export const EventCard = memo(function EventCard({
  event,
  index = 0,
  bookmarked = false,
  onToggleBookmark,
}: EventCardProps) {
  const {
    id,
    title,
    date,
    location,
    imageUrl,
    price,
    availableSeats,
    totalSeats,
    category,
  } = event;
  const [imageBroken, setImageBroken] = useState(false);

  const when = new Date(date);
  const dateLabel = formatShortDate(when);
  const relative = formatRelative(when);
  const hasSeatData =
    typeof totalSeats === "number" &&
    totalSeats > 0 &&
    typeof availableSeats === "number";
  const availability = hasSeatData ? (availableSeats / totalSeats) * 100 : 100;
  const isSoldOut = hasSeatData && availableSeats === 0;
  const isSelling = hasSeatData && availability > 0 && availability < 20;
  const isLowStock = hasSeatData && availability > 0 && availability < 30;

  const availColor = isSoldOut
    ? "bg-destructive"
    : isLowStock
      ? "bg-warning"
      : "bg-success";

  return (
    <div
      className="h-full animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none"
      style={{ animationDelay: `${(index % 4) * 100}ms` }}
    >
      <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0">
        {/* Image */}
        <div className="relative flex-shrink-0">
          <Link to={`/events/${id}`} className="block" tabIndex={-1} aria-hidden="true">
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              {imageUrl && !imageBroken ? (
                <img
                  src={sizedImage(imageUrl, 640)}
                  srcSet={imageSrcSet(imageUrl, [...WIDTHS.card])}
                  sizes={SIZES.card}
                  alt={title}
                  // Many poster hosts refuse hotlinks (403 when a Referer is sent).
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                  onError={() => setImageBroken(true)}
                />
              ) : (
                <EventImageFallback category={category} />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              {/* Price */}
              <div className="absolute left-3 top-3">
                <span className="inline-flex items-center rounded-lg border border-border bg-background/85 px-2.5 py-1 font-mono text-xs font-bold text-foreground backdrop-blur-md">
                  {typeof price === "number" && price === 0
                    ? "Free"
                    : formatPrice(price)}
                </span>
              </div>

              {/* Status (icon + text, never colour alone) */}
              {isSelling && (
                <div className="absolute right-3 top-3">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/85 px-2 py-0.5 text-[11px] font-semibold text-warning backdrop-blur-md">
                    <Zap className="h-3 w-3" />
                    Selling fast
                  </span>
                </div>
              )}
              {isSoldOut && (
                <div className="absolute right-3 top-3">
                  <span className="inline-flex items-center rounded-full border border-border bg-background/85 px-2 py-0.5 text-[11px] font-semibold text-destructive backdrop-blur-md">
                    Sold Out
                  </span>
                </div>
              )}
            </div>
          </Link>
          {/* Bookmark sits outside the image link so it is a valid, focusable control */}
          {onToggleBookmark && (
            <button
              type="button"
              className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/85 backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
              onClick={() => onToggleBookmark(id)}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark event"}
              aria-pressed={bookmarked}
            >
              <Heart
                className={`h-4 w-4 transition-colors ${
                  bookmarked
                    ? "fill-destructive text-destructive"
                    : "text-foreground"
                }`}
              />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          {category && (
            <span className="text-label uppercase text-primary">
              {category}
            </span>
          )}
          <Link to={`/events/${id}`} className="group/title min-w-0">
            <h3 className="font-display text-card-title line-clamp-2 text-foreground transition-colors duration-150 group-hover/title:text-primary">
              {title}
            </h3>
          </Link>

          <div className="flex flex-col gap-1.5 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar
                className="h-4 w-4 flex-shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="truncate text-sm" title={relative}>
                {dateLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin
                className="h-4 w-4 flex-shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="truncate text-sm">{location}</span>
            </div>
          </div>

          {hasSeatData && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Availability</span>
                <span className="font-mono">
                  {availableSeats}/{totalSeats}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out motion-reduce:transition-none ${availColor}`}
                  style={{ width: `${availability}%` }}
                />
              </div>
            </div>
          )}

          {/* CTA pinned to the bottom; no fixed card height, so no dead space */}
          <div className="mt-auto pt-1">
            <Button
              asChild
              className="group/btn h-11 w-full rounded-xl text-sm font-semibold"
              disabled={isSoldOut}
              variant={isSoldOut ? "secondary" : "default"}
            >
              <Link
                to={`/events/${id}`}
                className="flex items-center justify-center gap-1.5"
                aria-label={isSoldOut ? `${title}: sold out` : `View details for ${title}`}
              >
                {isSoldOut ? "Sold Out" : "View Details"}
                {!isSoldOut && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                )}
              </Link>
            </Button>
          </div>
        </div>
      </article>
    </div>
  );
});

EventCard.displayName = "EventCard";
