import { usePageTitle } from "@/shell";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileDown,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCw,
  ScanLine,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import QRCode from "qrcode";
import { ticketQrUrl } from "@/lib/tickets";
import { Ticket3D } from "@/components/ticket/Ticket3D";
import { drawTicket } from "@/components/ticket/drawTicket";
import { isVoid, ticketSettingsOf, toTicketData } from "@/components/ticket/ticketData";

type FetchState = "idle" | "loading" | "success" | "not_found" | "error";

/** Soft stage light behind the ticket; follows the theme. */
const Stage = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 55% 45% at 50% 42%, hsl(var(--primary) / 0.16), transparent 70%), radial-gradient(ellipse 40% 30% at 85% 0%, hsl(var(--primary) / 0.1), transparent 70%)",
      }}
    />
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: "radial-gradient(hsl(var(--foreground) / 0.1) 1px, transparent 1.4px)",
        backgroundSize: "22px 22px",
        WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, #000 20%, transparent 75%)",
        maskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, #000 20%, transparent 75%)",
      }}
    />
  </div>
);

/**
 * A booking's ticket. Shown automatically after booking (?new=1 plays the
 * print-in animation) and from My Tickets. The QR encodes the same
 * /validate/<ticket token> link as before; see lib/tickets.ts.
 */
const TicketGenerator = () => {
  const { id: bookingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();

  // Celebrate once: remember that this visit came from a fresh booking, then drop
  // ?new=1 from the address so a refresh or a shared link doesn't replay it.
  const [isNew] = useState(() => searchParams.get("new") === "1");
  useEffect(() => {
    if (searchParams.get("new")) navigate(location.pathname, { replace: true });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped API JSON, read by toTicketData
  const [booking, setBooking] = useState<any>(null);

  // Optional details printed on the ticket, prefilled from the profile.
  const [studentId, setStudentId] = useState("");
  const [course, setCourse] = useState("");

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [exporting, setExporting] = useState<null | "png" | "pdf">(null);

  // Prefill from the profile, but never over something already typed (the
  // profile object is replaced whenever the session refreshes).
  useEffect(() => {
    if (profile?.student_id) setStudentId((v) => v || profile.student_id || "");
    if (profile?.course) setCourse((v) => v || profile.course || "");
  }, [profile]);

  const holder =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || user?.email?.split("@")[0] || "";

  const ticket = useMemo(
    () =>
      booking
        ? toTicketData(booking, {
            holder,
            studentId: studentId.trim(),
            course: course.trim(),
          })
        : null,
    [booking, holder, studentId, course],
  );

  usePageTitle(ticket?.title || undefined, "Ticket");

  const fetchBookingDetails = useCallback(async () => {
    if (!bookingId || !user) return;

    if (!/^[0-9a-fA-F]{24}$/.test(bookingId)) {
      setErrorMsg("Invalid booking ID. Please go back to My Tickets and try again.");
      setFetchState("error");
      return;
    }

    setFetchState("loading");
    setErrorMsg("");
    setBooking(null);

    try {
      const res = await fetch(`/api/bookings/${bookingId}`, { credentials: "include" });

      if (res.status === 401) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
        navigate("/auth", { state: { from: `/tickets/${bookingId}` } });
        return;
      }

      if (res.status === 404) {
        setFetchState("not_found");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setBooking(data);
      setFetchState("success");
    } catch (err: unknown) {
      console.error("[TicketGenerator] fetch error:", err);
      setErrorMsg(
        (err instanceof Error && err.message) || "Unable to load booking details. Please check your connection and try again.",
      );
      setFetchState("error");
    }
  }, [bookingId, user, navigate]);

  useEffect(() => {
    if (user && bookingId) fetchBookingDetails();
  }, [fetchBookingDetails, user, bookingId]);

  // ── QR: generated as soon as the booking loads (no "Generate" step any more) ──
  useEffect(() => {
    // Never show (or download) one booking's QR on another's ticket.
    setQrDataUrl("");
    if (!booking) return;
    let cancelled = false;
    // The ticket token is the unguessable key the server checks; old booking-id QR codes still validate.
    const validateUrl = ticketQrUrl(booking?.ticket_token ?? bookingId ?? "");
    QRCode.toDataURL(validateUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => console.error("[TicketGenerator] QR gen error:", err));
    return () => {
      cancelled = true;
    };
  }, [booking, bookingId]);

  // ── Downloads: the ticket's front, drawn on a canvas (see drawTicket) ──────
  useEffect(() => {
    if (!exporting || !ticket || !qrDataUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const SCALE = 2.5;
        const canvas = await drawTicket(ticket, qrDataUrl, SCALE);
        if (cancelled) return;
        const name = `seatsync-ticket-${ticket.ref}`;
        if (exporting === "png") {
          const link = document.createElement("a");
          link.href = canvas.toDataURL("image/png");
          link.download = `${name}.png`;
          link.click();
          toast({ title: "Downloaded", description: "Ticket saved as PNG." });
        } else {
          // Loaded on demand so the PDF library stays off the ticket page's first load.
          const { jsPDF } = await import("jspdf");
          const w = canvas.width / SCALE;
          const h = canvas.height / SCALE;
          const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [w, h] });
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h, undefined, "NONE");
          pdf.save(`${name}.pdf`);
          toast({ title: "Downloaded", description: "Ticket saved as PDF." });
        }
      } catch {
        toast({ title: "Download failed", description: "Could not save the ticket. Please try again.", variant: "destructive" });
      } finally {
        if (!cancelled) setExporting(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exporting, ticket, qrDataUrl]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (fetchState === "loading" || fetchState === "idle") {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12" aria-busy="true" aria-label="Loading your ticket">
        <Skeleton className="mx-auto mb-3 h-14 w-64 bg-surface-elevated" />
        <Skeleton className="mx-auto mb-12 h-4 w-80 bg-surface-elevated" />
        <Skeleton className="mx-auto h-[340px] w-full max-w-[860px] rounded-3xl bg-surface-elevated" />
      </div>
    );
  }

  if (fetchState === "not_found") {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-section mb-6">Ticket not found</h1>
        <Alert variant="destructive" className="mb-6 text-left">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Booking not found</AlertTitle>
          <AlertDescription>
            This booking doesn't exist or doesn't belong to your account. It may have been cancelled.
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/tickets")}>← Back to My Tickets</Button>
      </div>
    );
  }

  if (fetchState === "error" || !ticket) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-section mb-6">Your ticket</h1>
        <Alert variant="destructive" className="mb-6 text-left">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load details</AlertTitle>
          <AlertDescription>{errorMsg || "Something went wrong."}</AlertDescription>
        </Alert>
        <div className="flex justify-center gap-3">
          <Button onClick={fetchBookingDetails} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
          <Button variant="secondary" onClick={() => navigate("/tickets")}>
            ← My Tickets
          </Button>
        </div>
      </div>
    );
  }

  const voided = isVoid(ticket);
  // The organiser decides which details the ticket carries (Admin → event → Ticket).
  const settings = ticketSettingsOf(booking?.event ?? booking?.event_id);
  const askStudentId = settings.show_student_id;
  const askCourse = settings.show_course;
  const seatList = ticket.seats.map((s) => `${s.row}${s.number}`).join(", ");

  return (
    <div className="pb-20">
      {/* ── Stage ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="ticket-title" className="relative isolate -mt-20 overflow-hidden pt-20">
        <Stage />
        <div className="container mx-auto max-w-5xl px-4 pb-14 pt-6">
          <Link
            to="/tickets"
            className="inline-flex items-center gap-2 rounded-full py-2 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            My tickets
          </Link>

          <header className="mx-auto mb-12 mt-4 max-w-2xl text-center">
            {isNew ? (
              <>
                <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-sm font-semibold text-success">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Booking confirmed
                </p>
                <h1 id="ticket-title" className="font-display text-[clamp(3.25rem,10vw,6rem)] font-extrabold uppercase leading-[0.84] text-foreground">
                  You're in<span className="text-primary">.</span>
                </h1>
                <p className="mx-auto mt-4 max-w-md text-pretty text-muted-foreground md:text-lg">
                  Your ticket is ready and saved in My Tickets. Show the QR code at the door.
                </p>
              </>
            ) : (
              <>
                <h1 id="ticket-title" className="font-display text-[clamp(3rem,8vw,5rem)] font-extrabold uppercase leading-[0.84] text-foreground">
                  Your ticket
                </h1>
                <p className="mt-3 text-pretty text-muted-foreground md:text-lg">
                  {voided ? "This booking was cancelled, so the ticket is void." : "Show the QR code at the door. Tilt it, flip it, save it."}
                </p>
              </>
            )}
          </header>

          <div className="mx-auto max-w-[860px]">
            <Ticket3D t={ticket} qr={qrDataUrl} flipped={flipped} reveal={isNew} onFlip={() => setFlipped((f) => !f)} />
          </div>
          <p className="mt-14 text-center text-sm text-muted-foreground">
            <span className="hidden [@media(hover:hover)]:inline">Move your mouse over it to tilt · drag sideways to flip</span>
            <span className="[@media(hover:hover)]:hidden">Swipe the ticket sideways to flip it</span>
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!voided && (
              <Button size="pill" className="gap-2" onClick={() => setQrOpen(true)} disabled={!qrDataUrl}>
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                Show QR at the door
              </Button>
            )}
            <Button size="pill" variant="outline" className="gap-2" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              {flipped ? "Show front" : "Flip ticket"}
            </Button>
            <Button size="pill" variant="outline" className="gap-2" onClick={() => setExporting("png")} disabled={!qrDataUrl || !!exporting}>
              {exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {exporting === "png" ? "Saving…" : "PNG"}
            </Button>
            <Button size="pill" variant="outline" className="gap-2" onClick={() => setExporting("pdf")} disabled={!qrDataUrl || !!exporting}>
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
              {exporting === "pdf" ? "Saving…" : "PDF"}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Details + door help ───────────────────────────────────────────── */}
      <div className={`container mx-auto grid gap-6 px-4 ${askStudentId || askCourse ? "max-w-5xl md:grid-cols-2" : "max-w-2xl"}`}>
        {(askStudentId || askCourse) && (
          <section aria-labelledby="personalise-title" className="rounded-3xl border border-border bg-card p-6 text-card-foreground md:p-8">
            <h2 id="personalise-title" className="font-display text-2xl font-extrabold uppercase">
              Your details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Optional. Printed on your ticket and in downloads.</p>
            <div className={`mt-6 grid gap-4 ${askStudentId && askCourse ? "sm:grid-cols-2" : ""}`}>
              {askStudentId && (
                <div>
                  <label htmlFor="studentId" className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    {settings.student_id_label}
                  </label>
                  <Input id="studentId" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. BCS2022171" className="rounded-xl" />
                </div>
              )}
              {askCourse && (
                <div>
                  <label htmlFor="course" className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    {settings.course_label}
                  </label>
                  <Input id="course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. B.Tech CSE" className="rounded-xl" />
                </div>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="door-title" className="rounded-3xl border border-border bg-card p-6 text-card-foreground md:p-8">
          <h2 id="door-title" className="font-display text-2xl font-extrabold uppercase">
            At the door
          </h2>
          <ol className="mt-6 space-y-5">
            {[
              { icon: Smartphone, title: "Open this ticket", text: "Use this page or the PNG/PDF you saved. Tap “Show QR at the door” for a bigger code." },
              { icon: ScanLine, title: "Get it scanned", text: "Staff scan the QR. It's checked in once, so keep it private." },
              { icon: Users, title: "Walk in together", text: `One code covers every seat on this booking${seatList ? ` (${seatList})` : ""}.` },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-foreground">{title}</span>
                  <span className="text-sm text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          {booking?.event?._id && (
            <Button asChild variant="link" className="mt-4 px-0">
              <Link to={`/events/${booking.event._id}`}>View event details</Link>
            </Button>
          )}
        </section>
      </div>

      {/* ── Big QR for the door: plain white, nothing to slow the scanner ──── */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-0 bg-white p-6 text-neutral-900 sm:p-8">
          <DialogTitle className="font-display text-3xl font-extrabold uppercase leading-none text-neutral-900">{ticket.title}</DialogTitle>
          <DialogDescription className="text-neutral-600">
            Seats {seatList || "—"} · No. {ticket.ref}. Turn your screen brightness up for a faster scan.
          </DialogDescription>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="Ticket QR code"
              className="mx-auto mt-2 aspect-square w-full max-w-[320px]"
              style={{ imageRendering: "pixelated" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TicketGenerator;
