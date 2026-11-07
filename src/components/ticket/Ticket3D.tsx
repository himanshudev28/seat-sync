import { useRef, useState } from "react";
import { Accessibility, QrCode } from "lucide-react";
import { useTilt } from "@/hooks/useTilt";
import { formatPrice } from "@/lib/utils";
import { admitLabel, isVoid, type TicketData, type TicketSeat } from "./ticketData";
import "./ticket.css";

const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? dateFmt.format(d) : "—";
};

const paidLabel = (t: TicketData) => (t.isFree || t.total <= 0 ? "Free" : formatPrice(t.total));

const statusInfo = (t: TicketData): { label: string; tone?: "warn" | "bad" } => {
  if (t.status === "cancelled") return { label: "Cancelled", tone: "bad" };
  if (t.status === "refunded") return { label: "Refunded", tone: "bad" };
  if (t.status === "pending") return { label: "Pending", tone: "warn" };
  if (t.checkedIn) return { label: "Checked in", tone: "warn" };
  return { label: "Confirmed" };
};

/** Concentric tiers, echoing the venue on the home page. */
const Arcs = () => (
  <svg viewBox="0 0 200 200" className="tk-art-arcs" fill="none" stroke="currentColor" strokeWidth="6" aria-hidden="true">
    {[40, 58, 76, 94].map((r) => (
      <circle key={r} cx="100" cy="100" r={r} strokeDasharray="7 5" />
    ))}
  </svg>
);

function Seats({ seats }: { seats: TicketSeat[] }) {
  if (seats.length === 0) return <span className="tk-value">—</span>;
  return (
    <div className="tk-seats">
      {seats.map((s) => (
        <span key={`${s.row}-${s.number}`} className="tk-seat" data-type={s.type ?? undefined}>
          {s.type === "wheelchair" && <Accessibility className="h-3.5 w-3.5" aria-label="Accessible space" />}
          {s.row}
          {s.number}
          {s.type === "vip" && <small>VIP</small>}
        </span>
      ))}
    </div>
  );
}

const Field = ({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) => (
  <div>
    <span className="tk-label">{label}</span>
    <span className={`tk-value block ${mono ? "tk-mono" : ""}`}>{children}</span>
  </div>
);

/** Front: the event, seats and holder, with the QR on the tear-off stub. */
export function TicketFront({ t, qr, hidden = false }: { t: TicketData; qr: string; hidden?: boolean }) {
  const status = statusInfo(t);
  const people = [
    t.holder && { label: "Name", value: t.holder },
    t.studentId && { label: t.studentIdLabel || "Student ID", value: t.studentId },
    t.course && { label: t.courseLabel || "Course", value: t.course },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <section className="tk-face tk-front" aria-label={`Ticket for ${t.title}`} aria-hidden={hidden}>
      <div className="tk-main">
        <div className="tk-art" aria-hidden="true">
          {t.imageUrl && (
            // The event's own artwork, faded into the ink. Left out of downloads: most poster
            // hosts don't allow their images to be redrawn on a canvas.
            <img src={t.imageUrl} alt="" className="tk-art-photo" referrerPolicy="no-referrer" draggable={false} data-no-dim />
          )}
          <div className="tk-art-dots" />
          <Arcs />
        </div>

        <header className="tk-top">
          <div>
            <div className="tk-brand">
              SEATSYNC<span>.</span>
            </div>
            {t.issuer && <div className="tk-issuer">{t.issuer}</div>}
          </div>
          <span className="tk-admit">{admitLabel(t)}</span>
        </header>

        <div>
          {t.category && <p className="tk-cat">{t.category}</p>}
          <h2 className="tk-title">{t.title}</h2>
        </div>

        <div className="tk-meta">
          <Field label="Date">{fmtDate(t.date)}</Field>
          <Field label="Time">{t.time || "See event"}</Field>
          <Field label="Venue">{t.venue || "—"}</Field>
          <Field label="Paid" mono>
            {paidLabel(t)}
          </Field>
        </div>

        <div>
          <span className="tk-label">Seat{t.seats.length === 1 ? "" : "s"}</span>
          <Seats seats={t.seats} />
        </div>

        {people.length > 0 && (
          <div className="tk-holder">
            {people.map((p) => (
              <Field key={p.label} label={p.label}>
                {p.value}
              </Field>
            ))}
          </div>
        )}

        {t.note && <p className="tk-note">{t.note}</p>}

        <span className="tk-foil" aria-hidden="true" />
        <span className="tk-shine" aria-hidden="true" />
        {isVoid(t) && (
          <div className="tk-void" aria-hidden="true">
            <span>VOID</span>
          </div>
        )}
      </div>

      <div className="tk-stub">
        <p className="tk-stub-label">Scan at entry</p>
        {qr ? (
          <img src={qr} alt="Ticket QR code. Show it at the entrance to be scanned." className="tk-qr" width={168} height={168} draggable={false} />
        ) : (
          <div className="tk-qr tk-qr-empty" role="img" aria-label="QR code loading">
            <QrCode className="h-12 w-12" aria-hidden="true" />
          </div>
        )}
        <p className="tk-ref">No. {t.ref}</p>
        <span className="tk-status" data-tone={status.tone}>
          {status.label}
        </span>
      </div>
    </section>
  );
}

/** Back: booking reference and the house rules. */
export function TicketBack({ t, hidden }: { t: TicketData; hidden: boolean }) {
  return (
    <section className="tk-face tk-back" aria-hidden={hidden} aria-label="Back of the ticket">
      <div className="tk-main">
        <div className="tk-back-art" aria-hidden="true" />
        <span className="tk-back-word" aria-hidden="true">
          SEATSYNC
        </span>
        <div>
          <span className="tk-label">Good to know</span>
          <ul className="tk-rules mt-2">
            {t.note && <li>{t.note}</li>}
            <li>Bring your ID: staff may ask to see it with your ticket.</li>
            <li>One QR code admits everyone on this booking: {t.seats.length || 1} seat{t.seats.length === 1 ? "" : "s"}.</li>
            <li>It is checked in once at the door, so keep it private and don't post it.</li>
            <li>Cancelled or refunded tickets are void and won't scan.</li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Field label="Booked">{fmtDate(t.bookedAt)}</Field>
          <Field label="Holder">{t.holder || "—"}</Field>
        </div>
      </div>
      <div className="tk-stub">
        <p className="tk-stub-label">Booking reference</p>
        <p className="font-display text-4xl font-extrabold tracking-wide">{t.ref}</p>
        <div className="tk-barcode" aria-hidden="true" />
        <p className="tk-ref">seatsync</p>
      </div>
    </section>
  );
}

const BURST_COLORS = ["#ff7a6b", "#c4a1ff", "#8fb3e8", "#fbbf24", "#ffffff"];

/** Seat-shaped confetti, deterministic so it renders the same every time. */
function Burst() {
  return (
    <div className="tk-burst" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * 360 + (i % 3) * 7;
        const d = 180 + ((i * 53) % 160);
        const s = ((i * 97) % 540) - 270;
        return (
          <i
            key={i}
            style={{ "--a": `${a}deg`, "--d": `${d}px`, "--s": `${s}deg`, "--c": BURST_COLORS[i % BURST_COLORS.length] } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

/** Horizontal drag past this many px flips the ticket; less springs back. */
const FLIP_DISTANCE = 70;

/**
 * Drag (mouse) or swipe (touch) the ticket sideways and it turns in 3D under
 * your finger; let go past FLIP_DISTANCE and it flips. Vertical swipes still
 * scroll the page (touch-action: pan-y on the scene). Writes --drag straight to
 * the card, so a drag never re-renders React.
 */
function useDragToFlip(onFlip?: () => void) {
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; id: number; moved: boolean } | null>(null);

  const reset = () => {
    const card = cardRef.current;
    if (!card) return;
    delete card.dataset.dragging;
    card.style.setProperty("--drag", "0deg");
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !onFlip) return;
      drag.current = { x: e.clientX, id: e.pointerId, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      const card = cardRef.current;
      if (!d || !card || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved) {
        if (Math.abs(dx) < 6) return; // a tap, not a drag
        d.moved = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // keep the drag even if the pointer leaves the ticket
        } catch {
          /* not capturable (e.g. a synthetic event): the drag still works while over the ticket */
        }
        card.dataset.dragging = "";
      }
      card.style.setProperty("--drag", `${Math.max(-110, Math.min(110, dx * 0.5)).toFixed(1)}deg`);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      reset();
      if (Math.abs(e.clientX - d.x) > FLIP_DISTANCE) onFlip?.();
    },
    onPointerCancel: () => {
      drag.current = null;
      reset();
    },
  };

  return { cardRef, handlers };
}

/**
 * The on-screen ticket: tilts toward the cursor (fine pointers only), turns
 * under a drag or swipe and flips past a threshold, and prints in with a little
 * celebration when `reveal` is set. With reduced motion it snaps instead of turning.
 */
export function Ticket3D({
  t,
  qr,
  flipped,
  reveal,
  onFlip,
}: {
  t: TicketData;
  qr: string;
  flipped: boolean;
  reveal?: boolean;
  /** Called when a drag or swipe asks to turn the ticket over. */
  onFlip?: () => void;
}) {
  const tiltRef = useTilt<HTMLDivElement>(9);
  // Only the first render after booking celebrates; re-renders (typing a student ID) don't replay it.
  const [celebrate] = useState(!!reveal);
  const { cardRef, handlers } = useDragToFlip(onFlip);

  return (
    <div
      className="tk-scene"
      data-flipped={flipped || undefined}
      data-reveal={celebrate || undefined}
      data-draggable={onFlip ? "" : undefined}
      {...handlers}
    >
      {celebrate && <Burst />}
      <div className="tk-floor" aria-hidden="true" />
      <div className="tk-float">
        <div ref={tiltRef} className="tk-tilt">
          <div ref={cardRef} className="tk-card">
            <TicketFront t={t} qr={qr} hidden={flipped} />
            <TicketBack t={t} hidden={!flipped} />
          </div>
        </div>
      </div>
    </div>
  );
}
