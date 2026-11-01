
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from "./providers/AuthProvider";
import Index from "./pages/Index";
import Header from "./components/Header";
import ErrorBoundary from "./components/ErrorBoundary";
import { RequireAdmin, RequireAuth } from "@/lib/auth/RequireAuth";
import { DocumentTitle, RouteFocus } from "./shell";

// Lazy-load every non-Index page. The dynamic-import factory is kept around
// so we can warm its chunk during browser idle time (see warmRoutes below).
const lazyImports = {
  Auth: () => import("./pages/Auth"),
  AuthCallback: () => import("./pages/AuthCallback"),
  NotFound: () => import("./pages/NotFound"),
  Events: () => import("./pages/Events"),
  EventDetail: () => import("./pages/EventDetail"),
  Profile: () => import("./pages/Profile"),
  Admin: () => import("./pages/Admin"),
  MyTickets: () => import("./pages/MyTickets"),
  AdminSetup: () => import("./pages/AdminSetup"),
  TicketGenerator: () => import("./pages/TicketGenerator"),
  AdminBookings: () => import("./pages/AdminBookings"),
  ValidateTicket: () => import("./pages/ValidateTicket"),
  Scanner: () => import("./pages/Scanner"),
};

const Auth            = lazy(lazyImports.Auth);
const AuthCallback    = lazy(lazyImports.AuthCallback);
const NotFound        = lazy(lazyImports.NotFound);
const Events          = lazy(lazyImports.Events);
const EventDetail     = lazy(lazyImports.EventDetail);
const Profile         = lazy(lazyImports.Profile);
const Admin           = lazy(lazyImports.Admin);
const MyTickets       = lazy(lazyImports.MyTickets);
const AdminSetup      = lazy(lazyImports.AdminSetup);
const TicketGenerator = lazy(lazyImports.TicketGenerator);
const AdminBookings   = lazy(lazyImports.AdminBookings);
const ValidateTicket  = lazy(lazyImports.ValidateTicket);
const Scanner         = lazy(lazyImports.Scanner);

// Analytics + SpeedInsights are non-critical — defer them to their own chunks
// so they don't block initial paint.
const Analytics = lazy(() =>
  import("@vercel/analytics/react").then((m) => ({ default: m.Analytics })),
);
const SpeedInsights = lazy(() =>
  import("@vercel/speed-insights/react").then((m) => ({ default: m.SpeedInsights })),
);

const PageFallback = () => (
  <div className="container mx-auto py-8 px-4 space-y-4 animate-pulse">
    <div className="h-8 w-1/3 bg-muted rounded-lg" />
    <div className="h-4 w-2/3 bg-muted rounded" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-64 bg-muted rounded-xl" />
      ))}
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // data considered fresh for 60s — no refetch on re-mount
      gcTime: 10 * 60_000,        // keep unused cache for 10min
      retry: 1,                   // default 3 retries hammers the server; 1 is enough
      refetchOnWindowFocus: false, // Safari fires this on every tab switch — kills perf
      refetchOnReconnect: false,
    },
  },
});

// Warm the most-likely next routes during browser idle time so the chunk is
// already in cache by the time the user clicks the link. ~99% of users hit
// /events from the homepage, so prioritise that.
function useWarmRoutes() {
  useEffect(() => {
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const handle = idle(() => {
      lazyImports.Events();
      lazyImports.EventDetail();
      lazyImports.Auth();
    }, { timeout: 3000 });
    return () => {
      const cancel =
        (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cancel) cancel(handle as number);
    };
  }, []);
}

const AppWithLayout = () => {
  const { pathname } = useLocation();
  return (
  <div className="flex flex-col min-h-screen">
    <Header />
    <main className="flex-1 pt-20">
      {/* A crash in one page keeps the header; keyed on the path so navigating away clears it. */}
      <ErrorBoundary inline key={pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/admin/bookings" element={<RequireAdmin><AdminBookings /></RequireAdmin>} />
          <Route path="/admin-setup" element={<AdminSetup />} />
          <Route path="/tickets" element={<RequireAuth><MyTickets /></RequireAuth>} />
          <Route path="/generate-ticket/:id" element={<RequireAuth><TicketGenerator /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </main>
    <Suspense fallback={null}>
      <Analytics />
      <SpeedInsights />
    </Suspense>
  </div>
  );
};

const RouteWarmer = () => {
  useWarmRoutes();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <RouteWarmer />
            {/* Per-route document titles, and focus + announcement on navigation (a11y). */}
            <DocumentTitle />
            <RouteFocus />
            <Routes>
              {/* Full-screen routes outside the layout: a crash (or a stale lazy chunk after a
                  deploy) shows the recovery screen instead of a blank page. */}
              <Route path="/validate/:bookingId" element={
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <ValidateTicket />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="/scan" element={
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <Scanner />
                  </Suspense>
                </ErrorBoundary>
              } />
              <Route path="*" element={<AppWithLayout />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
