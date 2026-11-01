import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Check, X, AlertTriangle, Loader2, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";

type Tone = "success" | "destructive" | "warning";

const TONE: Record<Tone, { ring: string; chip: string; text: string }> = {
  success: { ring: "border-success/40", chip: "bg-success/10", text: "text-success" },
  destructive: { ring: "border-destructive/40", chip: "bg-destructive/10", text: "text-destructive" },
  warning: { ring: "border-warning/40", chip: "bg-warning/10", text: "text-warning" },
};

function ResultShell({ tone, Icon, title, subtitle, children }: { tone: Tone; Icon: LucideIcon; title: string; subtitle: string; children?: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-6 text-foreground">
      <div role="status" aria-live="polite" className={`w-full max-w-md rounded-3xl border-2 bg-card p-6 text-center text-card-foreground sm:p-8 ${t.ring}`}>
        <div className={`mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full ${t.chip}`}>
          <Icon className={`h-12 w-12 ${t.text}`} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <h1 className={`font-display text-4xl font-bold ${t.text}`}>{title}</h1>
        <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
        {children}
        <p className="mt-6 text-label text-muted-foreground">SeatSync</p>
      </div>
    </main>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="text-label text-muted-foreground">{label}</span>
    <span className="text-right text-base font-medium">{value}</span>
  </div>
);


/**
 * Ticket check at the door. Opening this page only LOOKS UP the ticket (GET, no side effects), so link
 * previews, prefetching and refreshes can never use a ticket up. Checking someone in is an explicit
 * "Mark as used" button, shown only to admins (server contract agreed with macapp-0f).
 */
type Lookup = {
  valid: boolean;
  status?: "confirmed" | "cancelled" | "refunded" | "pending";
  checkedIn?: boolean;
  checkedInAt?: string | null;
};

type CheckIn =
  | { result: "CHECKED_IN" | "ALREADY_USED"; checkedInAt: string; checkedInBy?: string }
  | { result: "NOT_CONFIRMED"; status?: string }
  | { result: "WRONG_EVENT" };

type View =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ticket"; lookup: Lookup };

const formatTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");

export default function ValidateTicket() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const eventId = params.get("event") ?? undefined;

  const [view, setView] = useState<View>({ kind: "loading" });
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [checkInError, setCheckInError] = useState("");
  const [marking, setMarking] = useState(false);

  const lookUp = useCallback(async () => {
    if (!bookingId) {
      setView({ kind: "not_found" });
      return;
    }
    setView({ kind: "loading" });
    try {
      const res = await fetch(`/api/validate/${encodeURIComponent(bookingId)}`, { credentials: "include" });
      if (res.status === 404) {
        setView({ kind: "not_found" });
        return;
      }
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const data = (await res.json()) as Lookup;
      setView(data.valid === false && !data.status ? { kind: "not_found" } : { kind: "ticket", lookup: data });
    } catch {
      setView({ kind: "error", message: "We couldn't check this ticket. Check the connection and try again." });
    }
  }, [bookingId]);

  useEffect(() => {
    lookUp();
  }, [lookUp]);

  const markUsed = async () => {
    if (!bookingId || marking) return;
    setMarking(true);
    setCheckInError("");
    try {
      const res = await fetch(`/api/validate/${encodeURIComponent(bookingId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventId ? { eventId } : {}),
      });
      if (res.status === 401 || res.status === 403) {
        setCheckInError("Only organisers can check tickets in. Sign in with an admin account.");
        return;
      }
      if (res.ok || res.status === 409) {
        setCheckIn((await res.json()) as CheckIn);
        return;
      }
      throw new Error(String(res.status));
    } catch {
      setCheckInError("Check-in didn't go through. Try again.");
    } finally {
      setMarking(false);
    }
  };

  if (view.kind === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground" aria-busy="true">
        <Loader2 className="h-12 w-12 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        <p role="status" className="text-base text-muted-foreground">Checking ticket…</p>
      </main>
    );
  }

  if (view.kind === "not_found") {
    return <ResultShell tone="warning" Icon={AlertTriangle} title="Invalid ticket" subtitle="This ticket could not be found." />;
  }

  if (view.kind === "error") {
    return (
      <ResultShell tone="destructive" Icon={AlertTriangle} title="Error" subtitle={view.message}>
        <Button size="pill" className="mt-5 h-12 w-full" onClick={lookUp}>
          Try again
        </Button>
      </ResultShell>
    );
  }

  // Result of pressing "Mark as used".
  if (checkIn) {
    if (checkIn.result === "CHECKED_IN") {
      return (
        <ResultShell tone="success" Icon={Check} title="Checked in" subtitle="Entry granted.">
          <p className="mt-4 text-sm font-medium text-success">
            Checked in at {formatTime(checkIn.checkedInAt)}
            {checkIn.checkedInBy ? ` by ${checkIn.checkedInBy}` : ""}
          </p>
        </ResultShell>
      );
    }
    if (checkIn.result === "ALREADY_USED") {
      return (
        <ResultShell tone="destructive" Icon={X} title="Already used" subtitle={`Used at ${formatTime(checkIn.checkedInAt)}.`}>
          {checkIn.checkedInBy && <p className="mt-4 text-sm text-muted-foreground">Checked in by {checkIn.checkedInBy}</p>}
        </ResultShell>
      );
    }
    if (checkIn.result === "WRONG_EVENT") {
      return <ResultShell tone="warning" Icon={AlertTriangle} title="Wrong event" subtitle="This ticket is for a different event." />;
    }
    return (
      <ResultShell
        tone="warning"
        Icon={AlertTriangle}
        title="Not valid for entry"
        subtitle={`This booking is ${("status" in checkIn && checkIn.status) || "not confirmed"}.`}
      />
    );
  }

  const { lookup } = view;
  if (lookup.status && lookup.status !== "confirmed") {
    return (
      <ResultShell tone="warning" Icon={AlertTriangle} title="Not valid for entry" subtitle={`This booking is ${lookup.status}.`} />
    );
  }
  if (lookup.checkedIn) {
    return (
      <ResultShell
        tone="destructive"
        Icon={X}
        title="Already used"
        subtitle={lookup.checkedInAt ? `Used at ${formatTime(lookup.checkedInAt)}.` : "This ticket has already been scanned."}
      />
    );
  }

  // Valid and not yet used: nothing has changed. Staff confirm entry explicitly.
  return (
    <ResultShell tone="success" Icon={Check} title="Valid ticket" subtitle="Confirmed and not used yet.">
      {isAdmin ? (
        <>
          <Button size="pill" className="mt-6 h-14 w-full text-lg" onClick={markUsed} disabled={marking} aria-busy={marking}>
            {marking ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            {marking ? "Checking in…" : "Mark as used"}
          </Button>
          {checkInError && (
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              {checkInError}
            </p>
          )}
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Staff:{" "}
          <Link to="/auth" state={{ from: location }} className="font-medium text-primary underline-offset-4 hover:underline">
            sign in as an organiser
          </Link>{" "}
          to check this ticket in.
        </p>
      )}
    </ResultShell>
  );
}
