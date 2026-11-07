import { useCategories } from "./categories";

/** Used until the real categories load, or if there are too few to fill a tape. */
const FALLBACK = ["Concerts", "Match day", "Theatre", "Comedy", "Festivals", "Conferences"];

const Spark = () => (
  <svg viewBox="0 0 24 24" className="h-[0.55em] w-[0.55em] shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0z" />
  </svg>
);

/**
 * A strip of poster type running across the page, like gaffer tape over the
 * hero's edge. Purely decorative: the category links live in the events section.
 */
export function CategoryTape() {
  const { data = [] } = useCategories();
  const words = data.length >= 4 ? data.map((d) => d.category) : FALLBACK;
  // Each half of the track must be wider than the screen for a seamless loop.
  const half = [...words, ...words, ...words];

  return (
    // Vertical padding leaves room for the tilted tape's raised ends.
    <div aria-hidden="true" className="relative z-20 -mt-16 overflow-hidden py-10 md:-mt-24">
      <div className="lp-tape bg-primary py-3 text-primary-foreground shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.6)] md:py-4">
        <div className="lp-marquee">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {half.map((w, i) => (
                <span
                  key={`${copy}-${i}`}
                  className="flex items-center gap-6 pr-6 font-display text-[clamp(1.75rem,4.2vw,3.25rem)] font-extrabold uppercase leading-none tracking-wide md:gap-8 md:pr-8"
                >
                  {w}
                  <Spark />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
