import { Lock, Search } from "lucide-react";
import { formatPrice } from "@/lib/utils";

/**
 * Miniature app screens for the "How it works" device: illustrations of the
 * booking flow built from the app's own tokens, so they follow the theme.
 */

const PRICE = formatPrice(1200, { whole: true });

const SAMPLE = [
  { d: "12", m: "Dec", t: "Indie Night Live", v: "Concert · Main Hall", p: formatPrice(899, { whole: true }) },
  { d: "14", m: "Dec", t: "City Derby", v: "Sports · North Stand", p: formatPrice(1250, { whole: true }) },
  { d: "20", m: "Dec", t: "Midsummer Night", v: "Theatre · Studio 2", p: formatPrice(650, { whole: true }) },
];

const Brand = () => (
  <span className="font-display text-xl font-extrabold">
    SeatSync<span className="text-primary">.</span>
  </span>
);

export function BrowseScreen() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <Brand />
        <span className="h-8 w-8 rounded-full bg-accent" />
      </div>
      <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        Search events, artists, venues
      </div>
      <div className="flex flex-wrap gap-2">
        {["All", "Concert", "Sports", "Theatre"].map((c, i) => (
          <span
            key={c}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              i === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {SAMPLE.map((e, i) => (
          <div
            key={e.t}
            className={`flex items-center gap-3 rounded-2xl border bg-card p-3 ${i === 0 ? "border-primary/50 shadow-md" : "border-border"}`}
          >
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent">
              <span className="font-display text-lg font-extrabold leading-none">{e.d}</span>
              <span className="text-[10px] font-bold uppercase text-primary">{e.m}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{e.t}</p>
              <p className="truncate text-xs text-muted-foreground">{e.v}</p>
            </div>
            <span className="font-mono text-xs font-bold">{e.p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* A fixed little house: 1 = taken. Row C, seat 7 is the one being picked. */
const HOUSE = [
  "001100110",
  "010011000",
  "000001100",
  "110000011",
  "001101000",
  "100010010",
  "011000110",
];
const PICK = { r: 2, c: 6 };

export function SeatsScreen() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground">Indie Night Live</p>
        <p className="font-display text-2xl font-extrabold uppercase">Choose your seat</p>
      </div>
      <div className="mx-auto h-2 w-3/4 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <p className="-mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Stage</p>
      <div className="mx-auto grid grid-cols-9 gap-1.5">
        {HOUSE.flatMap((row, r) =>
          row.split("").map((cell, c) => {
            const picked = r === PICK.r && c === PICK.c;
            const tier = r < 2 ? "bg-seat-premium" : r < 5 ? "bg-seat-standard" : "bg-seat-economy";
            return (
              <span
                key={`${r}-${c}`}
                className={`h-5 w-5 rounded-t-[5px] rounded-b-[3px] ${
                  picked
                    ? "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.3),0_0_14px_hsl(var(--primary)/0.8)]"
                    : cell === "1"
                      ? "bg-foreground/15"
                      : tier
                } ${c === 4 ? "ml-2" : ""}`}
              />
            );
          }),
        )}
      </div>
      <div className="flex justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-seat-premium" />Premium</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-seat-standard" />Standard</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-seat-economy" />Economy</span>
      </div>
      <div className="mt-auto flex items-center justify-between rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <div>
          <p className="text-xs text-muted-foreground">Row C · Seat 7</p>
          <p className="font-mono text-base font-bold">{PRICE}</p>
        </div>
        <span className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Continue</span>
      </div>
    </div>
  );
}

export function CheckoutScreen() {
  return (
    <div className="flex h-full flex-col gap-4">
      <p className="font-display text-2xl font-extrabold uppercase">Checkout</p>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Indie Night Live</p>
        <p className="text-xs text-muted-foreground">Fri, 12 Dec · Main Hall</p>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span>1 × Standard · Row C, Seat 7</span>
          <span className="font-mono font-bold">{PRICE}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border-2 border-primary bg-accent p-3 font-semibold">UPI</div>
        <div className="rounded-xl border border-border bg-card p-3 text-muted-foreground">Card</div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono text-xl font-bold">{PRICE}</span>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <span className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          <Lock className="h-4 w-4" />
          Pay {PRICE}
        </span>
        <span className="text-center text-[11px] text-muted-foreground">Secure checkout · instant confirmation</span>
      </div>
    </div>
  );
}

/** Deterministic QR-like pattern with the three finder squares. Decorative. */
const QR_SIZE = 21;
const qrCells = (() => {
  const cells: [number, number][] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > QR_SIZE - 9 && y < 8) || (x < 8 && y > QR_SIZE - 9);
  for (let y = 0; y < QR_SIZE; y++)
    for (let x = 0; x < QR_SIZE; x++) if (!inFinder(x, y) && rand() < 0.48) cells.push([x, y]);
  return cells;
})();

const Finder = ({ x, y }: { x: number; y: number }) => (
  <>
    <rect x={x} y={y} width={7} height={7} rx={1.4} />
    <rect x={x + 1} y={y + 1} width={5} height={5} rx={1} className="fill-card" />
    <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.6} />
  </>
);

export function TicketScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="w-full overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-border">
        <div className="bg-primary px-5 py-3 text-primary-foreground">
          <p className="font-display text-lg font-extrabold uppercase tracking-[0.25em]">Admit one</p>
        </div>
        <div className="px-5 pb-4 pt-4">
          <p className="font-display text-3xl font-extrabold uppercase leading-none">Indie Night Live</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-muted-foreground">Row</p><p className="font-mono text-base font-bold">C</p></div>
            <div><p className="text-muted-foreground">Seat</p><p className="font-mono text-base font-bold">7</p></div>
            <div><p className="text-muted-foreground">Doors</p><p className="font-mono text-base font-bold">7:30</p></div>
          </div>
        </div>
        <div className="relative border-t-2 border-dashed border-border">
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-background" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-background" />
        </div>
        <div className="flex flex-col items-center gap-2 px-5 py-5">
          <svg viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`} className="h-28 w-28 fill-foreground" aria-hidden="true">
            {qrCells.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
            ))}
            <Finder x={0} y={0} />
            <Finder x={QR_SIZE - 7} y={0} />
            <Finder x={0} y={QR_SIZE - 7} />
          </svg>
          <p className="text-xs text-muted-foreground">Show this at the door</p>
        </div>
      </div>
    </div>
  );
}
