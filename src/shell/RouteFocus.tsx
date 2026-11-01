import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/** How long to wait for a lazy page to render its target before falling back. */
const MAX_FRAMES = 60;

/**
 * After an in-app navigation, moves focus to the new page's h1 (or its <main>) and announces the
 * page title, so keyboard and screen-reader users land on the new content instead of <body>. With a
 * hash (`/events/7#seats`) the element with that id gets focus instead. Skipped on the first load
 * and when only the search or hash changes.
 */
export function RouteFocus() {
  const { pathname, hash } = useLocation();
  const hashRef = useRef(hash);
  hashRef.current = hash;
  const first = useRef(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    let frames = 0;
    const settle = () => {
      if (cancelled) return;
      const id = hashRef.current ? decodeURIComponent(hashRef.current.slice(1)) : "";
      const anchor = id ? document.getElementById(id) : null;
      const main = document.querySelector<HTMLElement>("main");
      const heading = main?.querySelector<HTMLElement>("h1") ?? null;
      // Wait for whatever we want to focus: the anchored section if there's a hash, else the h1.
      if (!(id ? anchor : heading) && frames++ < MAX_FRAMES) {
        requestAnimationFrame(settle);
        return;
      }
      const target = anchor ?? heading ?? main;
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: Boolean(anchor) });
      }
      setMessage(document.title);
    };
    requestAnimationFrame(settle);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
