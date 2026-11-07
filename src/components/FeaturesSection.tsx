import { useEffect, useRef, useState } from "react";
import { Armchair, CircleCheck, Search, Ticket, type LucideIcon } from "lucide-react";
import { BrowseScreen, CheckoutScreen, SeatsScreen, TicketScreen } from "./landing/StepScreens";

type Step = {
  title: string;
  text: string;
  Screen: () => JSX.Element;
  chip: { icon: LucideIcon; label: string; className: string };
};

const STEPS: Step[] = [
  {
    title: "Find your night",
    text: "Search by city, date or category. Concerts, matches, theatre and more, all in one place.",
    Screen: BrowseScreen,
    chip: { icon: Search, label: "Concerts this weekend", className: "-right-8 -top-5" },
  },
  {
    title: "Pick your exact seat",
    text: "The live seat map shows what's free right now. Tap the seat you want and it's held for you while you check out.",
    Screen: SeatsScreen,
    chip: { icon: Armchair, label: "Row C · Seat 7 held for you", className: "-left-12 -bottom-5" },
  },
  {
    title: "Check out in seconds",
    text: "Pay safely in a few taps. No queues, no printing, and your booking is confirmed straight away.",
    Screen: CheckoutScreen,
    chip: { icon: CircleCheck, label: "Payment confirmed", className: "-right-8 -top-5" },
  },
  {
    title: "Walk right in",
    text: "Your ticket arrives instantly with a QR code. Show it at the door and enjoy the show.",
    Screen: TicketScreen,
    chip: { icon: Ticket, label: "Ticket in your pocket", className: "-left-12 -top-5" },
  },
];

/** A phone-ish frame. `children` is the screen. */
function DeviceFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative aspect-[4/5] w-full rounded-[2.25rem] border border-white/10 bg-card p-2.5 shadow-[0_60px_120px_-50px_hsl(var(--lp-glow)/0.55)] ${className}`}
    >
      <div className="relative h-full overflow-hidden rounded-[1.75rem] bg-background text-foreground">{children}</div>
    </div>
  );
}

/** Desktop: one device, tilted in 3D, showing whichever step is being read. */
function StickyDevice({ active }: { active: number }) {
  return (
    <div className="lp-device relative mx-auto w-full max-w-[400px]">
      <DeviceFrame>
        {STEPS.map(({ Screen, title }, i) => (
          <div key={title} className="lp-screen absolute inset-0 p-6" data-active={i === active || undefined} aria-hidden={i !== active}>
            <Screen />
          </div>
        ))}
      </DeviceFrame>
      {/* Floating callouts sit 70px in front of the screen, hanging off its top or bottom
          edge so they cover little of it, and stick out at most 3rem so they stay inside
          the column at every desktop width. */}
      {STEPS.map(({ chip, title }, i) => (
        <div
          key={title}
          aria-hidden="true"
          data-active={i === active || undefined}
          className={`lp-chip3d absolute flex items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_18px_40px_-12px_rgb(0_0_0/0.5)] ${chip.className}`}
        >
          <chip.icon className="h-4 w-4" />
          {chip.label}
        </div>
      ))}
    </div>
  );
}

export function FeaturesSection() {
  const [active, setActive] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // The step crossing the middle of the screen is the one being read.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    itemRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section aria-labelledby="how-title" className="lp-ink relative overflow-clip py-24 md:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 85% 15%, hsl(var(--lp-glow) / 0.22), transparent 70%), radial-gradient(ellipse 40% 35% at 0% 85%, rgb(var(--seat-premium) / 0.14), transparent 70%)",
        }}
      />

      <div className="container relative mx-auto max-w-7xl px-4">
        <div className="lp-reveal max-w-3xl">
          <h2
            id="how-title"
            className="font-display text-[clamp(3.25rem,8vw,6.5rem)] font-extrabold uppercase leading-[0.84]"
          >
            From browse
            <br />
            to <span className="text-[hsl(var(--lp-glow))]">front row</span>
          </h2>
          <p className="lp-ink-muted mt-6 max-w-md text-pretty text-lg leading-relaxed">
            Four steps and about a minute, from "what's on?" to walking through the door.
          </p>
        </div>

        <div className="mt-14 grid lg:mt-16 lg:grid-cols-12 lg:gap-12">
          <ol className="lg:col-span-6">
            {STEPS.map(({ title, text, Screen }, i) => (
              <li
                key={title}
                ref={(el) => (itemRefs.current[i] = el)}
                data-index={i}
                data-active={i === active || undefined}
                className="lp-step-item flex flex-col gap-8 border-t border-[hsl(var(--lp-ink-line))] py-12 lg:min-h-[64vh] lg:justify-center lg:border-0 lg:py-0"
              >
                <div className="flex items-start gap-5 md:gap-7">
                  <span className="lp-step-num shrink-0 font-display text-7xl font-extrabold leading-[0.8] md:text-8xl">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="lp-step-title font-display text-3xl font-extrabold uppercase leading-none md:text-[2.75rem]">{title}</h3>
                    <p className="lp-ink-muted mt-3 max-w-sm text-pretty leading-relaxed md:text-lg">{text}</p>
                  </div>
                </div>
                {/* Phones and tablets: each step carries its own screen. */}
                <div aria-hidden="true" className="mx-auto w-full max-w-[340px] lg:hidden">
                  <DeviceFrame>
                    <div className="absolute inset-0 p-5">
                      <Screen />
                    </div>
                  </DeviceFrame>
                </div>
              </li>
            ))}
          </ol>

          <div aria-hidden="true" className="hidden lg:col-span-6 lg:block">
            <div className="sticky top-[calc(50vh-15.5rem)] py-4">
              <StickyDevice active={active} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
