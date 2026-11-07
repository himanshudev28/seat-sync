import { useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { useTilt } from "@/hooks/useTilt";

/**
 * Newsletter sign-up as a ticket: coral body, perforation, tear-off stub.
 * Notches are cut with a CSS mask (see .lp-ticket in landing.css); the stub's
 * size has to match the mask's --perf-x / --perf-y.
 */
export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tiltRef = useTilt<HTMLDivElement>(4);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast({ title: "Thank you for subscribing to our newsletter!" });
      setEmail("");
    } catch (error) {
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="newsletter-title" className="relative py-16 md:py-24">
      <div className="container mx-auto max-w-6xl px-4">
        {/* Reveal and tilt both set transform, so they live on separate elements. */}
        <div className="lp-reveal">
        <div ref={tiltRef} className="lp-tilt">
          <div className="lp-ticket-shadow">
            <div className="lp-ticket relative flex flex-col overflow-hidden rounded-[2rem] bg-primary text-primary-foreground md:flex-row">
              <div aria-hidden="true" className="lp-dots pointer-events-none absolute inset-0 opacity-40" />
              <span aria-hidden="true" className="lp-glare" />

              <div className="relative flex-1 p-8 sm:p-10 md:p-14">
                <h2
                  id="newsletter-title"
                  className="font-display text-[clamp(3rem,7vw,5.5rem)] font-extrabold uppercase leading-[0.84]"
                >
                  Never miss
                  <br />a show
                </h2>
                <p className="mt-5 max-w-md text-pretty leading-relaxed md:text-lg">
                  Presales, new events and early access, straight to your inbox.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 flex max-w-lg flex-col gap-3 sm:flex-row">
                  <label htmlFor="newsletter-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="newsletter-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-14 min-w-0 flex-1 rounded-full border-0 bg-white px-6 text-base text-neutral-900 shadow-inner placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--lp-ink))] focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-14 shrink-0 rounded-full bg-[hsl(var(--lp-ink))] px-8 text-base font-semibold text-[hsl(var(--lp-ink-fg))] transition-[transform,opacity] duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transform-none"
                  >
                    {isSubmitting ? "Subscribing…" : "Subscribe"}
                  </button>
                </form>

                <p className="mt-4 text-xs">
                  By subscribing, you agree to our Privacy Policy. Unsubscribe at any time.
                </p>
              </div>

              {/* Tear-off stub */}
              <div
                aria-hidden="true"
                className="lp-perf relative flex h-[132px] items-center justify-between gap-6 px-8 md:h-auto md:w-[210px] md:flex-col md:justify-center md:gap-8 md:px-6 md:py-10"
              >
                <p className="font-display text-2xl font-extrabold uppercase tracking-[0.3em] md:rotate-180 md:text-3xl md:[writing-mode:vertical-rl]">
                  Admit one
                </p>
                <div className="flex flex-col items-end gap-2 md:items-center">
                  <div className="lp-barcode h-12 w-32 opacity-90 md:h-24 md:w-28" />
                  <p className="font-mono text-xs">No. 000001</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
