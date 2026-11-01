/**
 * Full-screen loading state: the SeatSync wordmark with its coral dot bouncing (redesign.md §4).
 * Announced once to assistive tech; the motion stops under reduced motion.
 */
export default function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-5">
        <p aria-hidden="true" className="flex items-end font-display text-4xl font-bold tracking-tight text-foreground">
          SeatSync
          <span className="mb-2 ml-1 inline-block h-3 w-3 rounded-full bg-primary motion-safe:animate-bounce" />
        </p>
        <div aria-hidden="true" className="h-1 w-40 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-[slide-bar_1.4s_ease-in-out_infinite]" />
        </div>
        <span className="sr-only">Loading SeatSync…</span>
      </div>
    </div>
  );
}
