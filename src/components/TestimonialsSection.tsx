const TESTIMONIALS = [
  {
    quote: "SeatSync made booking concert tickets so much easier. I could see exactly which seats were available in real-time!",
    author: "Sarah Johnson",
    role: "Music Fan",
    initial: "S",
    color: "bg-primary/20 text-primary border-primary/20",
  },
  {
    quote: "As an event organizer, the admin dashboard gives me complete control. Real-time updates are a game changer for managing large crowds.",
    author: "Michael Chen",
    role: "Event Organizer",
    initial: "M",
    color: "bg-foreground/10 text-foreground border-border",
  },
  {
    quote: "I love how easy it is to find and book events. The seat selection interface is intuitive and the whole process is seamless.",
    author: "Priya Patel",
    role: "Theater Enthusiast",
    initial: "P",
    color: "bg-success/15 text-success border-success/20",
  },
];

const Stars = ({ count = 5 }: { count?: number }) => (
  <div className="flex gap-0.5">
    {Array(count).fill(0).map((_, i) => (
      <svg key={i} className="h-4 w-4 text-warning" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </div>
);

export function TestimonialsSection() {
  const [featured, ...rest] = TESTIMONIALS;

  return (
    <section className="py-20 md:py-32 bg-background relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-4 relative z-10">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 animate-fadeIn">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
            Loved by <span className="text-primary">thousands</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg">
            See what our community says about their experience with SeatSync.
          </p>
        </div>

        {/* Featured testimonial — dark inverse card */}
        <div
          className="relative rounded-3xl bg-foreground text-background overflow-hidden p-8 md:p-12 mb-6 animate-fadeIn"
          style={{ animationDelay: "60ms" }}
        >
          {/* Decorative quote mark */}
          <div className="absolute top-0 right-6 text-[160px] leading-none text-background/[0.06] font-serif select-none pointer-events-none">"</div>
          {/* Glow blob */}
          <div className="absolute -bottom-16 -left-16 w-[300px] h-[300px] bg-primary/20 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10 md:flex md:items-end md:gap-12">
            <div className="flex-1 mb-6 md:mb-0">
              <Stars />
              <blockquote className="mt-5">
                <p className="text-xl md:text-2xl font-medium leading-relaxed text-background/90">
                  "{featured.quote}"
                </p>
              </blockquote>
            </div>

            <footer className="flex items-center gap-4 flex-shrink-0">
              {/* Featured card is inverted (bg-foreground): a solid coral avatar keeps the initial ≥ 4.5:1 in both themes. */}
              <div className="h-12 w-12 rounded-2xl border-2 border-primary bg-primary text-primary-foreground flex items-center justify-center text-base font-bold flex-shrink-0">
                {featured.initial}
              </div>
              <div>
                <cite className="not-italic text-base font-semibold text-background block">{featured.author}</cite>
                <p className="text-sm text-background/50 mt-0.5">{featured.role}</p>
              </div>
            </footer>
          </div>
        </div>

        {/* Secondary testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {rest.map((t, i) => (
            <div
              key={t.author}
              className="group flex flex-col gap-5 rounded-2xl border border-border bg-card p-7 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg transition-all duration-200 animate-fadeIn"
              style={{ animationDelay: `${(i + 1) * 80 + 60}ms` }}
            >
              <div className="flex items-start justify-between">
                <Stars />
                {/* Decorative small quote */}
                <span className="text-5xl leading-none text-border/40 font-serif select-none">"</span>
              </div>
              <blockquote className="flex-1">
                <p className="text-sm text-muted-foreground leading-relaxed">"{t.quote}"</p>
              </blockquote>
              <footer className="flex items-center gap-3 pt-4 border-t border-border/50">
                <div className={`h-9 w-9 rounded-xl border flex items-center justify-center text-xs font-bold flex-shrink-0 ${t.color}`}>
                  {t.initial}
                </div>
                <div>
                  <cite className="not-italic text-sm font-semibold text-foreground block">{t.author}</cite>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </footer>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
