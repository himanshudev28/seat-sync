import { useState, useEffect, useRef } from "react";
import { WifiOff, X } from "lucide-react";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [dismissed, setDismissed] = useState(false);
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const goOffline = () => { setIsOffline(true); setDismissed(false); };
    const goOnline = () => {
      setIsOffline(false);
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
      onlineTimerRef.current = setTimeout(() => setDismissed(true), 3000);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
    };
  }, []);

  if (!isOffline || dismissed) return null;

  return (
    <div className="fixed top-20 left-0 right-0 z-[9998] px-4 pointer-events-none">
      <div role="status" aria-live="polite" className="max-w-2xl mx-auto pointer-events-auto">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border-l-4 border-primary bg-primary/10 dark:bg-primary/5 shadow-sm text-sm font-medium text-foreground">
          <WifiOff aria-hidden="true" className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1">You're offline. Changes will sync when connected.</span>
          <button
            onClick={() => setDismissed(true)}
            className="-my-2 -mr-2 ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss offline notice"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
