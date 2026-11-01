import { Search, LayoutGrid, CreditCard, Ticket } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Browse Events",
    description: "Search by city, date, or category. Find concerts, sports, theatre, and more curated for you.",
    icon: Search,
    accent: "bg-primary/10 text-primary dark:bg-primary/15",
    border: "border-primary/20",
  },
  {
    number: "02",
    title: "Pick Your Seats",
    description: "Use our live seat map to see real-time availability and choose exactly where you want to sit.",
    icon: LayoutGrid,
    accent: "bg-foreground/5 text-foreground",
    border: "border-border",
  },
  {
    number: "03",
    title: "Secure Checkout",
    description: "Pay safely and instantly with bank-grade encryption. Your transaction is always protected.",
    icon: CreditCard,
    accent: "bg-success/10 text-success",
    border: "border-success/20",
  },
  {
    number: "04",
    title: "Enjoy the Show",
    description: "Get your digital ticket instantly. Scan at the door and enjoy the experience you've been waiting for.",
    icon: Ticket,
    accent: "bg-warning/10 text-warning",
    border: "border-warning/20",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 md:py-28 bg-muted/30 relative overflow-hidden border-y border-border/50">

      <div className="container max-w-7xl mx-auto px-4 relative z-10">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14 animate-fadeIn">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
            From browse to{" "}
            <span className="text-primary">front row</span>
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Book any event in 4 simple steps — it takes less than a minute.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 overflow-hidden hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl transition-all duration-250 animate-fadeIn"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {/* Large background step number — visual anchor, not a connector */}
              <span className="absolute top-3 right-4 text-[5.5rem] font-black leading-none select-none pointer-events-none text-foreground/[0.04] group-hover:text-foreground/[0.06] transition-colors duration-300">
                {step.number}
              </span>

              {/* Icon */}
              <div className={`relative z-10 h-12 w-12 rounded-2xl border flex items-center justify-center flex-shrink-0 ${step.accent} ${step.border}`}>
                <step.icon className="h-5 w-5" />
              </div>

              {/* Text */}
              <div className="relative z-10">
                <h3 className="font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
