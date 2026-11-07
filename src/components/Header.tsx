import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Menu, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Mobile menu uses framer-motion (~120 KB gzipped 42 KB). Only ~5–10% of
// homepage visitors ever open the menu on mobile, so don't pay that cost on
// initial paint — load the chunk on the first menu toggle.
const MobileMenu = lazy(() => import("./MobileMenu"));

// The account dropdown (Radix DropdownMenu + floating-ui) is also off the entry chunk. The
// trigger is a plain button until the first click; hover/focus prefetch the chunk.
const loadUserMenu = () => import("./HeaderUserMenu");
const HeaderUserMenu = lazy(loadUserMenu);

const NAV_LINKS = [
  { to: "/events", label: "Events" },
];

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // The menu chunk (framer-motion, ~43 KB gzip) is requested only once the menu is first opened.
  // It used to be rendered closed on every page, which fetched it on every page load anyway.
  const [menuMounted, setMenuMounted] = useState(false);
  useEffect(() => {
    if (isMenuOpen) setMenuMounted(true);
  }, [isMenuOpen]);
  const [scrolled, setScrolled] = useState(false);

  const isAdmin = profile?.is_admin ?? false;
  const [userMenuActive, setUserMenuActive] = useState(false);

  // Same markup/aria Radix's Trigger renders; once the lazy menu mounts, Trigger clones this
  // element and takes over (open state, aria-expanded, key handling).
  const userMenuTrigger = user ? (
    <button
      type="button"
      aria-label="Account menu"
      {...(userMenuActive ? {} : { "aria-haspopup": "menu" as const, "aria-expanded": false, "data-state": "closed" })}
      onPointerEnter={() => void loadUserMenu()}
      onFocus={() => void loadUserMenu()}
      onClick={userMenuActive ? undefined : () => setUserMenuActive(true)}
      onKeyDown={
        userMenuActive
          ? undefined
          : (e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setUserMenuActive(true);
              }
            }
      }
      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ml-2 transition-transform duration-150 hover:scale-105 active:scale-95"
    >
      <Avatar className="h-9 w-9 border border-border shadow-sm">
        <AvatarImage src={profile?.avatar_url || ""} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
          {user.email?.charAt(0).toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
    </button>
  ) : null;

  // Scroll shadow effect — rAF-throttled and only sets state on threshold crossing
  // to avoid a state churn (and re-render) on every scroll event.
  useEffect(() => {
    let ticking = false;
    let lastState = false;
    // Read the scroll position on the next frame: reading it during mount forced an early
    // synchronous layout of the whole page (~70 ms on a mid-range phone).
    const first = requestAnimationFrame(() => {
      lastState = window.scrollY > 8;
      setScrolled(lastState);
    });
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = window.scrollY > 8;
        if (next !== lastState) {
          lastState = next;
          setScrolled(next);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => { setIsMenuOpen(false); }, [location.pathname]);

  const handleSignOut = useCallback(() => {
    signOut();
    setIsMenuOpen(false);
    window.location.href = "/";
  }, [signOut]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 flex justify-center transition-all duration-300 ${
          scrolled ? "pt-2" : "pt-4"
        }`}
      >
        <div
          className={`w-full max-w-7xl mx-4 transition-all duration-300 rounded-full px-6 ${
            scrolled
              ? "bg-background/85 backdrop-blur-xl shadow-sm border border-border/50"
              : "bg-background/50 backdrop-blur-sm border border-border/40"
          }`}
        >
          <div className="flex justify-between items-center h-14">

            {/* ── Logo ──────────────────────────────────────────── */}
            <Link to="/" className="flex items-center gap-0.5 group">
              <span className="font-display font-extrabold text-2xl uppercase tracking-wide text-foreground transition-colors group-hover:text-primary">SeatSync</span>
              <span className="text-primary font-bold text-2xl leading-none">.</span>
            </Link>

            {/* ── Desktop Nav ───────────────────────────────────── */}
            <nav aria-label="Main" className="hidden md:flex items-center gap-1">
              {[
                ...NAV_LINKS,
                ...(user ? [{ to: "/tickets", label: "My Tickets" }] : []),
                ...(isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={isActive(to) ? "page" : undefined}
                  className={`relative rounded-full px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm font-medium transition-colors duration-200
                    after:content-[''] after:absolute after:bottom-1.5 after:left-1/2 after:h-0.5 after:bg-primary after:transition-all after:duration-200
                    ${
                      isActive(to)
                        ? "text-primary after:w-4/5 after:-translate-x-1/2"
                        : "text-muted-foreground hover:text-foreground after:w-0 hover:after:w-4/5 hover:after:-translate-x-1/2"
                    }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* ── Desktop Controls ──────────────────────────────── */}
            <div className="hidden md:flex items-center gap-2.5">
              <ThemeToggle />
              {user ? (
                <div className="flex items-center gap-2">
                  {userMenuActive ? (
                    // Fallback is the same inert button, so there is no flicker while the chunk loads.
                    <Suspense fallback={userMenuTrigger}>
                      <HeaderUserMenu
                        trigger={userMenuTrigger}
                        email={user.email}
                        firstName={profile?.first_name}
                        lastName={profile?.last_name}
                        isAdmin={isAdmin}
                        onNavigate={navigate}
                        onSignOut={handleSignOut}
                      />
                    </Suspense>
                  ) : (
                    userMenuTrigger
                  )}
                </div>
              ) : !isActive("/auth") && (
                // On /auth the page already owns the sign-in action — a second
                // "Sign In" button in the header is just noise.
                <button
                  onClick={() => navigate("/auth")}
                  className="bg-primary text-primary-foreground rounded-full px-5 py-2 text-sm font-semibold shadow-sm hover:bg-primary/90 active:scale-95 motion-reduce:transform-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* ── Mobile Menu Button ────────────────────────────── */}
            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setIsMenuOpen((v) => !v)}
                // Start fetching the menu chunk on touch, a few ms before the click lands.
                onPointerDown={() => void import("./MobileMenu")}
                className="h-11 w-11 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-muted/60 active:scale-95 motion-reduce:transform-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMenuOpen}
                aria-controls={menuMounted ? "mobile-menu" : undefined}
              >
                {isMenuOpen ? (
                  <X aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Menu aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile overlay — code-split, only fetched when first opened */}
      {menuMounted && (
      <Suspense fallback={null}>
        <MobileMenu
          open={isMenuOpen}
          user={user}
          profile={profile}
          isAdmin={isAdmin}
          isActive={isActive}
          onClose={() => setIsMenuOpen(false)}
          onSignOut={handleSignOut}
          onSignInClick={() => { navigate("/auth"); setIsMenuOpen(false); }}
        />
      </Suspense>
      )}
    </>
  );
}
