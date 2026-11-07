const TESTIMONIALS = [
  {
    quote: "SeatSync made booking concert tickets so much easier. I could see exactly which seats were available in real-time!",
    author: "Sarah Johnson",
    role: "Music Fan",
    initial: "S",
    color: "bg-primary text-primary-foreground",
  },
  {
    quote: "As an event organizer, the admin dashboard gives me complete control. Real-time updates are a game changer for managing large crowds.",
    author: "Michael Chen",
    role: "Event Organizer",
    initial: "M",
    color: "bg-seat-standard text-background",
  },
  {
    quote: "I love how easy it is to find and book events. The seat selection interface is intuitive and the whole process is seamless.",
    author: "Priya Patel",
    role: "Theater Enthusiast",
    initial: "P",
    color: "bg-seat-premium text-background",
  },
];

const Stars = ({ className = "h-4 w-4" }: { className?: string }) => (
  <div className="flex gap-0.5 text-warning" role="img" aria-label="Rated 5 out of 5">
    {Array.from({ length: 5 }, (_, i) => (
      <svg key={i} className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </div>
);

const Person = ({ t, size = "h-12 w-12 text-base" }: { t: (typeof TESTIMONIALS)[number]; size?: string }) => (
  <figcaption className="flex items-center gap-3">
    {/* Seat-tier colours as avatars. Tiers are dark in light mode and light in dark mode, so
        the initial uses the page background colour to stay readable in both. */}
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold ${size} ${t.color}`}>
      {t.initial}
    </span>
    <span>
      <cite className="block font-semibold not-italic text-foreground">{t.author}</cite>
      <span className="text-sm text-muted-foreground">{t.role}</span>
    </span>
  </figcaption>
);

export function TestimonialsSection() {
  const [featured, ...rest] = TESTIMONIALS;

  return (
    <section aria-labelledby="voices-title" className="relative overflow-hidden py-24 md:py-32">
      <div className="container mx-auto max-w-7xl px-4">
        <h2
          id="voices-title"
          className="lp-reveal font-display text-[clamp(3rem,7vw,5.5rem)] font-extrabold uppercase leading-[0.84] text-foreground"
        >
          Word from
          <br />
          the <span className="text-primary">front row</span>
        </h2>

        <div className="mt-14 grid gap-14 lg:mt-20 lg:grid-cols-12 lg:gap-20">
          <figure className="lp-reveal relative lg:col-span-7">
            <span
              aria-hidden="true"
              className="block h-14 select-none font-display text-[9rem] font-extrabold leading-[0.9] text-primary"
            >
              &ldquo;
            </span>
            <blockquote className="mt-4">
              <p className="font-display text-[clamp(2rem,3.8vw,3.25rem)] font-bold leading-[1.02] text-foreground text-balance">
                {featured.quote}
              </p>
            </blockquote>
            <div className="mt-10">
              <Person t={featured} />
            </div>
          </figure>

          <div className="flex flex-col divide-y divide-border lg:col-span-5">
            {rest.map((t) => (
              <figure key={t.author} className="lp-reveal flex flex-col gap-5 py-9 first:pt-0 last:pb-0">
                <Stars />
                <blockquote>
                  <p className="text-pretty text-lg leading-relaxed text-foreground/85">{t.quote}</p>
                </blockquote>
                <Person t={t} size="h-10 w-10 text-sm" />
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
