import { useState, useEffect, memo, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Search, X, CalendarX, AlertTriangle } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { EventCard } from "@/components/EventCard";
import type { Event as CardEvent } from "@/types";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocalStorage } from "@/hooks/useLocalStorage";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  total_seats?: number;
  sold_seats?: number;
};

const PAGE_SIZE = 12;

// Must return the SAME shape as the home page's category query — both use the
// ["events","categories"] key, and React Query serves one cache to both.
async function fetchCategories(): Promise<{ category: string; count: number }[]> {
  const res = await fetch("/api/events?facets=true");
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

async function fetchEventsList(filter: string): Promise<Event[]> {
  const url = new URL("/api/events", window.location.origin);
  url.searchParams.set("published", "true");
  if (filter !== "all") url.searchParams.set("category", filter);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as Event[];
}


/** Adapts the API row to the shape the shared EventCard renders. */
const toCardEvent = (e: Event): CardEvent => ({
  id: e.id,
  title: e.title,
  description: e.description,
  date: e.date,
  time: "",
  location: e.location,
  price: e.is_free ? 0 : e.price,
  imageUrl: e.image_url ?? "",
  totalSeats: e.total_seats ?? 0,
  availableSeats:
    typeof e.total_seats === "number" && typeof e.sold_seats === "number"
      ? e.total_seats - e.sold_seats
      : 0,
  category: e.category,
});

// ── Filter chip ───────────────────────────────────────────────────────────────
const FilterPill = memo(({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex h-11 shrink-0 cursor-pointer select-none items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none
      ${active
        ? "border-transparent bg-primary text-primary-foreground"
        : "border-border bg-secondary text-secondary-foreground hover:border-primary/40"
      }`}
  >
    {label}
  </button>
));
FilterPill.displayName = "FilterPill";

// ── Main Events Page ──────────────────────────────────────────────────────────
export default function Events() {
  // The category lives in the URL so links like /events?category=Concert from
  // the home page land on a filtered list, and so a filtered list stays
  // shareable and survives a reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("category") || "all";
  const setFilter = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === "all") params.delete("category");
          else params.set("category", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 280);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "price-asc" | "price-desc">("date");
  const [page, setPage] = useState(1);
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>("ss_bookmarks", []);

  const { data: events = [], isLoading: loading, isError, refetch } = useQuery({
    queryKey: ["events", "list", filter],
    queryFn: () => fetchEventsList(filter),
    staleTime: 60_000,
    // Keep previous data visible while refetching after a filter change —
    // avoids the page flashing back to the skeleton on every pill click.
    placeholderData: (prev) => prev,
  });

  // Categories come from a facet query, not from `events` — deriving them from
  // the filtered result set collapsed the pill bar to the single active
  // category, so there was no way back to a sibling category.
  const { data: facets = [] } = useQuery({
    queryKey: ["events", "categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
  const categories = useMemo(() => facets.map((f) => f.category), [facets]);

  // A ?category= that matches nothing (a stale link, a renamed category) would
  // otherwise render an empty list with no active pill and no explanation.
  const unknownCategory =
    filter !== "all" &&
    categories.length > 0 &&
    !categories.some((c) => c.toLowerCase() === filter.toLowerCase());

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  }, [setBookmarks]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, dateFilter, freeOnly, sortBy, filter]);

  // Memoised filtering + sorting
  const filtered = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => {
        if (search) {
          const q = search.toLowerCase();
          if (
            !e.title.toLowerCase().includes(q) &&
            !e.location.toLowerCase().includes(q) &&
            !(e.description || "").toLowerCase().includes(q)
          )
            return false;
        }
        if (freeOnly && !e.is_free) return false;
        if (dateFilter !== "all") {
          const d = new Date(e.date);
          if (dateFilter === "today") {
            if (d.toDateString() !== now.toDateString()) return false;
          } else if (dateFilter === "week") {
            const week = new Date(now);
            week.setDate(now.getDate() + 7);
            if (d < now || d > week) return false;
          } else if (dateFilter === "month") {
            const month = new Date(now);
            month.setMonth(now.getMonth() + 1);
            if (d < now || d > month) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return a.price - b.price;
        if (sortBy === "price-desc") return b.price - a.price;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [events, search, freeOnly, dateFilter, sortBy]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paginated.length < filtered.length;

  const clearSearch = () => setSearchRaw("");
  const clearAll = () => {
    setFilter("all");
    setDateFilter("all");
    setFreeOnly(false);
    setSearchRaw("");
  };
  const hasActiveFilters = searchRaw || filter !== "all" || dateFilter !== "all" || freeOnly;

  return (
    <div className="page-wrapper">
      <div className="container mx-auto py-10 px-4 max-w-7xl">

        {/* ── Page Header ─────────────────────────────────────── */}
        <div className="mb-8 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Upcoming{" "}
                <span className="text-primary">Events</span>
              </h1>
              <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
                Browse and book tickets for the best experiences
              </p>
            </div>
            {!loading && filtered.length > 0 && (
              <div className="flex items-center gap-2 rounded-full bg-muted/80 backdrop-blur-sm border border-border px-4 py-2 text-sm font-medium text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-success motion-safe:animate-pulse" />
                {filtered.length} event{filtered.length !== 1 ? "s" : ""} available
              </div>
            )}
          </div>
        </div>

        {/* ── Search + Sort ────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              className="search-input pl-10 pr-10 h-11"
              placeholder="Search by title, location, or description…"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              id="events-search"
            />
            {searchRaw && (
              <button
                onClick={clearSearch}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-11 text-sm border border-input rounded-xl px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
            aria-label="Sort events"
          >
            <option value="date">Date (soonest)</option>
            <option value="price-asc">Price (low→high)</option>
            <option value="price-desc">Price (high→low)</option>
          </select>
        </div>

        {/* ── Filter chips (one scrollable row on mobile) ──────── */}
        <div className="mb-7 flex flex-col gap-3">
          <div
            role="group"
            aria-label="Filter events"
            className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 scrollbar-none"
          >
            {["all", ...categories].map((cat) => (
              <FilterPill
                key={cat}
                label={cat === "all" ? "All Events" : cat}
                active={cat === "all" ? filter === "all" : filter.toLowerCase() === cat.toLowerCase()}
                onClick={() => setFilter(cat)}
              />
            ))}

            {categories.length > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />}

            {(["all", "today", "week", "month"] as const).map((d) => (
              <FilterPill
                key={d}
                label={
                  d === "all" ? "Any Date"
                  : d === "today" ? "Today"
                  : d === "week" ? "This Week"
                  : "This Month"
                }
                active={dateFilter === d}
                onClick={() => setDateFilter(d)}
              />
            ))}

            <FilterPill
              label="Free Only"
              active={freeOnly}
              onClick={() => setFreeOnly((v) => !v)}
            />
          </div>

          {hasActiveFilters && (
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={clearAll}
                className="h-11 rounded-full px-4 text-sm font-semibold text-primary"
              >
                <X className="mr-1.5 h-4 w-4" />
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        {loading ? (
          <div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="status"
            aria-busy="true"
            aria-label="Loading events"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} variant="event" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert">
            <EmptyState
              icon={<AlertTriangle />}
              title="We couldn't load events"
              description="Something went wrong on our side. Check your connection and try again."
              action={
                <Button size="pill" onClick={() => refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<CalendarX />}
            title={unknownCategory ? `Nothing in "${filter}"` : "No events found"}
            description={
              unknownCategory
                ? "That category has no upcoming events. Pick another above."
                : filter !== "all"
                ? "No upcoming events in this category yet. Pick another above."
                : "Check back later for upcoming events."
            }
            action={
              filter !== "all" ? (
                <Button variant="outline" size="pill" onClick={() => setFilter("all")}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CalendarX />}
            title="No events found"
            description={
              search
                ? `Nothing matches "${search}". Try a different search term.`
                : "Try adjusting your filters to find what you're looking for."
            }
            action={
              <Button variant="outline" size="pill" onClick={clearAll}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div>
            {/* Keeps the outline h1 → h2 → h3 (cards use h3 titles). */}
            <h2 className="sr-only">Events</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginated.map((event, i) => (
                <EventCard
                  key={event.id}
                  event={toCardEvent(event)}
                  index={i}
                  bookmarked={bookmarks.includes(event.id)}
                  onToggleBookmark={toggleBookmark}
                />
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex flex-col items-center gap-2 mt-10">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-xl px-8 font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                >
                  Load More
                  <span className="ml-2 text-xs opacity-70">
                    ({filtered.length - paginated.length} remaining)
                  </span>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Showing {paginated.length} of {filtered.length} events
                </p>
              </div>
            )}
            {!hasMore && filtered.length > PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground mt-8">
                All {filtered.length} events loaded
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
