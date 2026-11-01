import { Link } from "react-router-dom";

const SOCIAL_ICONS = [
  {
    label: "Twitter",
    href: "#",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "#",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "#",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
        <rect width="4" height="12" x="2" y="9"/>
        <circle cx="4" cy="4" r="2"/>
      </svg>
    ),
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand + tagline */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-0.5 mb-4">
              <span className="font-display font-bold text-xl tracking-tight text-foreground">SeatSync</span>
              <span className="text-primary font-bold text-2xl leading-none">.</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Book events, concerts, and more with real-time seat selection. Built for live experiences.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Quick Links</h2>
            <ul aria-label="Quick links" className="space-y-1 text-sm">
              {[
                { to: "/", label: "Home" },
                { to: "/events", label: "Events" },
                { to: "/tickets", label: "My Tickets" },
                { to: "/profile", label: "Profile" },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="inline-flex min-h-8 items-center rounded-md text-muted-foreground hover:text-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Legal</h2>
            <ul className="space-y-1 text-sm">
              {["Privacy Policy", "Terms of Service", "Cookie Policy", "Refund Policy"].map((item) => (
                <li key={item}>
                  {/* No legal pages exist yet: plain text rather than links that go nowhere. */}
                  <span className="inline-flex min-h-8 items-center text-muted-foreground">
                    {item} <span className="ml-1.5 text-xs text-muted-foreground/80">(coming soon)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Follow Us</h2>
            <div className="flex items-center gap-3">
              {SOCIAL_ICONS.map(({ label, href, icon }) => (
                href === "#" ? (
                  // Placeholder until real profiles exist: shown, but not a dead link.
                  <span
                    key={label}
                    role="img"
                    aria-label={`${label} (coming soon)`}
                    title={`${label}: coming soon`}
                    className="h-11 w-11 rounded-lg border border-border flex items-center justify-center text-muted-foreground/70"
                  >
                    {icon}
                  </span>
                ) : (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="h-11 w-11 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 hover:-translate-y-0.5 motion-reduce:transform-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {icon}
                  </a>
                )
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground">© {currentYear} SeatSync. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">Built for live experiences</p>
        </div>
      </div>
    </footer>
  );
}
