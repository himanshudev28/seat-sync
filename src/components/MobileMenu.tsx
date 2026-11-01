import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tickets,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
} | null;

type User = {
  email?: string | null;
} | null;

interface MobileMenuProps {
  open: boolean;
  user: User;
  profile: Profile;
  isAdmin: boolean;
  isActive: (path: string) => boolean;
  onClose: () => void;
  onSignOut: () => void;
  onSignInClick: () => void;
}

export default function MobileMenu({
  open,
  user,
  profile,
  isAdmin,
  isActive,
  onClose,
  onSignOut,
  onSignInClick,
}: MobileMenuProps) {
  const items: { to: string; label: string; icon: LucideIcon }[] = [
    { to: "/events", label: "Events", icon: LayoutDashboard },
    ...(user ? [{ to: "/tickets", label: "My Tickets", icon: Tickets }] : []),
    ...(user ? [{ to: "/profile", label: "Profile", icon: UserIcon }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin Dashboard", icon: LayoutDashboard }] : []),
    ...(isAdmin ? [{ to: "/admin/bookings", label: "Manage Bookings", icon: BookOpen }] : []),
  ];

  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  // Escape closes; on open, focus moves into the menu so keyboard users start at the first link.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const el = panel.current;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("a, button")?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      // Closing returns focus to the menu button (unless a link already moved focus to a new page).
      if (!document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement)) {
        document.querySelector<HTMLElement>('[aria-controls="mobile-menu"]')?.focus();
      }
    };
  }, [open, onClose]);

  return (
    <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {open && (
        <motion.div
          key="mobile-menu"
          id="mobile-menu"
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: "-100%" }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: "-100%" }}
          transition={{ duration: reduce ? 0.12 : 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-40 md:hidden bg-background flex flex-col pt-20 pb-8 px-6 overflow-y-auto"
        >
          {user && (
            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
              <Avatar className="h-12 w-12 border-2 border-primary/30">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {user.email?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">
                  {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "User"}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{user.email}</p>
              </div>
            </div>
          )}

          <nav aria-label="Main" className="flex flex-col gap-2 flex-1">
            {items.map(({ to, label, icon: Icon }, i) => (
              <motion.div
                key={to}
                initial={reduce ? false : { opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  to={to}
                  onClick={onClose}
                  aria-current={isActive(to) ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-base font-medium transition-colors duration-150 ${
                    isActive(to)
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-foreground hover:bg-muted/70"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              </motion.div>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-border">
            {user ? (
              <button
                onClick={onSignOut}
                className="flex w-full items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base font-medium text-destructive hover:bg-destructive/20 transition-colors"
              >
                <LogOut aria-hidden="true" className="h-5 w-5" />
                Sign Out
              </button>
            ) : (
              <button
                onClick={onSignInClick}
                className="flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-3 text-base font-semibold hover:bg-primary/90 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </MotionConfig>
  );
}
