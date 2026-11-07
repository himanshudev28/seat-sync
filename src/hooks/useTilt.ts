import { useEffect, useRef } from "react";

/** Fine pointer, hover, and no reduced-motion request: the only case where cursor-driven 3D runs. */
export const TILT_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canTilt = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(TILT_QUERY).matches;

/**
 * Cursor-driven 3D tilt with a moving glare. Writes CSS variables straight to
 * the element (no React re-render per frame): --tilt-x / --tilt-y (deg) and
 * --glare-x / --glare-y (%), plus a data-tilting attribute while the pointer
 * is over it. Used by the landing page (.lp-tilt) and the ticket (.tk-tilt).
 * `max` is the largest rotation in degrees.
 */
export function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canTilt()) return;

    let frame = 0;
    let rect: DOMRect | null = null;
    let px = 0;
    let py = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--tilt-x", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(px * max).toFixed(2)}deg`);
      el.style.setProperty("--glare-x", `${((px + 1) * 50).toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${((py + 1) * 50).toFixed(1)}%`);
    };

    // Measure once on enter: the rect of a tilted element changes as it tilts,
    // which would feed back into the angle and jitter.
    const onEnter = () => {
      rect = el.getBoundingClientRect();
      el.dataset.tilting = "";
    };
    const onMove = (e: PointerEvent) => {
      if (!rect) onEnter();
      const r = rect as DOMRect;
      px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      rect = null;
      delete el.dataset.tilting;
      if (frame) cancelAnimationFrame(frame);
      px = 0;
      py = 0;
      apply();
    };

    // Scrolling moves the element under a resting pointer: measure again on the next move.
    const onScroll = () => {
      rect = null;
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, [max]);

  return ref;
}
