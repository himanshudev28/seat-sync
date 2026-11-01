import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Route guards. They wait for the session check (`isLoading`) before deciding, so a refresh or
 * deep link on a protected page no longer bounces to /auth. The login page gets `state.from`
 * and returns there after signing in.
 */

function Checking() {
  return (
    <div role="status" aria-live="polite" className="container mx-auto flex min-h-[40vh] items-center justify-center px-4">
      <span className="text-sm text-muted-foreground">Checking your session…</span>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Checking />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Checking />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  // Signed in but not an admin: send home rather than to a login page they can't use.
  if (!profile?.is_admin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
