import { memo, useEffect, useRef } from "react";
import { TILT_QUERY, prefersReducedMotion } from "@/hooks/useTilt";

/**
 * The hero's 3D venue: a stage and nine tiers of seats in an arc, built from
 * plain DOM + CSS 3D transforms (no WebGL, no extra bundle). Seats use the
 * same tier colours as the real seat map; coral marks a seat being booked.
 *
 * Geometry is in "plane units": the floor is 100 × 68 units and 1 unit is
 * 1cqw, so the whole scene scales with its container.
 */

type Tier = "premium" | "standard" | "economy";
type SeatSpec = { id: number; x: number; y: number; a: number; k: number; tier: Tier; taken: boolean };
type RowSpec = { r: number; R: number; seats: SeatSpec[] };

const ROWS = 9;
const CX = 50; // stage centre
const CY = 60;
const R0 = 17; // radius of the front row
const GAP = 4.35; // row spacing
const SWEEP = 64; // degrees either side of centre
const PITCH = 2.8; // seat spacing along the arc
const AISLES = [-24, 24];
const ROW_LETTERS = "ABCDEFGHI";

const BASE_VX = 56;
const BASE_VZ = -16;

/** Small seeded PRNG so the starting house looks the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tierFor = (r: number): Tier => (r < 2 ? "premium" : r < 5 ? "standard" : "economy");

function buildVenue(): RowSpec[] {
  const rand = mulberry32(11);
  const rows: RowSpec[] = [];
  let id = 0;
  for (let r = 0; r < ROWS; r++) {
    const R = R0 + r * GAP;
    const n = Math.floor((R * 2 * SWEEP * Math.PI) / 180 / PITCH);
    const aisleHalf = ((PITCH * 0.8) / R) * (180 / Math.PI);
    const seats: SeatSpec[] = [];
    for (let i = 0; i < n; i++) {
      const a = -SWEEP + ((i + 0.5) / n) * 2 * SWEEP;
      if (AISLES.some((x) => Math.abs(a - x) < aisleHalf)) continue;
      const rad = (a * Math.PI) / 180;
      // Centre and front seats go first, like a real on-sale.
      const demand = 0.12 + 0.34 * (1 - Math.abs(a) / SWEEP) * (1 - r / (ROWS + 2));
      seats.push({
        id: id++,
        x: CX + R * Math.sin(rad),
        y: CY - R * Math.cos(rad),
        a,
        k: seats.length,
        tier: tierFor(r),
        taken: rand() < demand,
      });
    }
    rows.push({ r, R, seats });
  }
  return rows;
}

const VENUE = buildVenue();

/** The highlighted "your seat": row C, just right of centre. */
const PIN_ROW = 2;
const PIN = VENUE[PIN_ROW].seats.reduce((best, s) => (Math.abs(s.a - 12) < Math.abs(best.a - 12) ? s : best));

const arcPath = (R: number) => {
  const s = (SWEEP * Math.PI) / 180;
  const x1 = CX - R * Math.sin(s);
  const x2 = CX + R * Math.sin(s);
  const y = CY - R * Math.cos(s);
  return `M ${x1.toFixed(2)} ${y.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y.toFixed(2)}`;
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

export const VenueScene = memo(function VenueScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);

  // Cursor parallax: the camera follows the pointer anywhere over the hero.
  useEffect(() => {
    const plane = planeRef.current;
    const scene = sceneRef.current;
    if (!plane || !scene) return;
    if (typeof window.matchMedia !== "function" || !window.matchMedia(TILT_QUERY).matches) return;

    const host = (scene.closest("section") as HTMLElement | null) ?? scene;
    const pin = plane.querySelector<HTMLElement>(".lp-pin");
    // Only the elements that read a value get it, so a frame restyles a handful
    // of nodes rather than the whole hero (see the @property note in landing.css).
    const angled = pin ? [plane, pin] : [plane];
    let floats: HTMLElement[] = [];
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let frame = 0;

    const tick = () => {
      cx += (tx - cx) * 0.075;
      cy += (ty - cy) * 0.075;
      const vx = `${(BASE_VX - cy * 6).toFixed(2)}deg`;
      const vz = `${(BASE_VZ + cx * 11).toFixed(2)}deg`;
      for (const el of angled) {
        el.style.setProperty("--vx", vx);
        el.style.setProperty("--vz", vz);
      }
      for (const el of floats) {
        el.style.setProperty("--px", cx.toFixed(3));
        el.style.setProperty("--py", cy.toFixed(3));
      }
      frame = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (frame) return;
      // The spotlight cards arrive after a fetch, so look them up per gesture.
      floats = Array.from(host.querySelectorAll<HTMLElement>(".lp-float"));
      frame = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      for (const el of angled) {
        el.style.removeProperty("--vx");
        el.style.removeProperty("--vz");
      }
    };
  }, []);

  // "Live" house: every so often a free seat flashes coral and becomes taken.
  // Runs only while the venue is on screen and the tab is visible; the DOM is
  // updated directly so nothing re-renders. Off screen, the hero's CSS loops
  // (beams, drift, bobbing cards) are paused too via data-lp-paused.
  useEffect(() => {
    const scene = sceneRef.current;
    const plane = planeRef.current;
    if (!scene || !plane || prefersReducedMotion()) return;
    const host = (scene.closest("section") as HTMLElement | null) ?? scene;

    const seats = Array.from(plane.querySelectorAll<HTMLElement>(".lp-seat:not([data-s='me'])"));
    const timers = new Set<number>();
    let interval = 0;

    const step = () => {
      if (document.hidden) return;
      const free: HTMLElement[] = [];
      const taken: HTMLElement[] = [];
      for (const s of seats) {
        if (!s.dataset.s) free.push(s);
        else if (s.dataset.s === "t") taken.push(s);
      }
      // Keep the house between roughly a quarter and half full.
      if (taken.length > seats.length * 0.48) {
        delete taken[Math.floor(Math.random() * taken.length)].dataset.s;
      }
      const pick = free[Math.floor(Math.random() * free.length)];
      if (!pick) return;
      pick.dataset.s = "f";
      const t = window.setTimeout(() => {
        timers.delete(t);
        if (pick.dataset.s === "f") pick.dataset.s = "t";
      }, 1100);
      timers.add(t);
    };

    const start = () => {
      host.removeAttribute("data-lp-paused");
      if (!interval) interval = window.setInterval(step, 850);
    };
    const stop = () => {
      host.setAttribute("data-lp-paused", "");
      window.clearInterval(interval);
      interval = 0;
    };

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
      io.observe(scene);
    } else {
      start();
    }

    return () => {
      io?.disconnect();
      stop();
      host.removeAttribute("data-lp-paused");
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div ref={sceneRef} className="lp-venue" aria-hidden="true">
      <div className="lp-rig">
        <div ref={planeRef} className="lp-plane">
          <div className="lp-slab lp-slab-front" />
          <div className="lp-slab lp-slab-left" />
          <div className="lp-slab lp-slab-right" />

          <div className="lp-stage">
            <span>STAGE</span>
          </div>

          {VENUE.map((row) => (
            <div key={row.r} className="lp-row" style={{ "--r": row.r } as Vars}>
              <svg className="lp-step" viewBox="0 0 100 68" preserveAspectRatio="none">
                <path d={arcPath(row.R + 0.35)} />
              </svg>

              {row.seats.map((s) => (
                <span
                  key={s.id}
                  className="lp-seat"
                  data-tier={s.tier}
                  data-s={s === PIN ? "me" : s.taken ? "t" : undefined}
                  style={{ left: `${s.x}cqw`, top: `${s.y}cqw`, "--a": `${s.a}deg`, "--k": s.k } as Vars}
                />
              ))}

              {row.r === PIN_ROW && (
                <div className="lp-pin" style={{ left: `${PIN.x}cqw`, top: `${PIN.y}cqw` }}>
                  <span className="lp-pin-card">
                    Row {ROW_LETTERS[PIN_ROW]} · Seat {PIN.k + 1}
                  </span>
                  <span className="lp-pin-stem" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
