import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { formatPrice } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, ChevronLeft, ChevronRight, RefreshCw, Trash2, Eye,
  CheckCircle2, XCircle, Clock, ArrowLeft, Download, Filter, X,
  Ticket, Calendar, MapPin, User, Mail, Phone, CreditCard,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BookingSeat {
  seat_id: string;
  row: string;
  number: number;
  label: string;
  seat_type: "standard" | "vip" | "wheelchair" | "blocked";
  price: number;
  status: string;
}

interface Booking {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "refunded" | "checked-in";
  total_price: number;
  checked_in: boolean;
  checked_in_at: string | null;
  booking_note: string | null;
  created_at: string;
  updated_at: string;
  seat_count: number;
  seats: BookingSeat[];
  event: {
    id: string;
    title: string;
    date: string;
    location: string;
    price: number;
    category: string;
    image_url: string | null;
    is_free: boolean;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    student_id: string | null;
    avatar_url: string | null;
  } | null;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: Booking["status"]) {
  const cfg: Record<string, { label: string; className: string }> = {
    confirmed:   { label: "Confirmed",   className: "bg-success/10 text-success border-success/30" },
    pending:     { label: "Pending",     className: "bg-warning/10 text-warning border-warning/30" },
    cancelled:   { label: "Cancelled",   className: "bg-destructive/10 text-destructive border-destructive/30" },
    refunded:    { label: "Refunded",    className: "bg-accent text-accent-foreground border-primary/30" },
    "checked-in":{ label: "Checked-in", className: "bg-surface-elevated text-foreground border-border" },
  };
  const c = cfg[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  const Icon = status === "confirmed" || status === "checked-in" ? CheckCircle2 : status === "pending" ? Clock : XCircle;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${c.className}`}><Icon className="h-3 w-3" aria-hidden="true" />{c.label}</span>;
}

function seatTypeBadge(type: string) {
  if (type === "vip") return <span className="rounded px-1.5 py-0.5 text-xs bg-warning/10 text-warning font-semibold">VIP</span>;
  if (type === "wheelchair") return <span className="rounded px-1.5 py-0.5 text-xs bg-seat-standard/15 text-foreground font-semibold">♿ Wheelchair</span>;
  if (type === "blocked") return <span className="rounded px-1.5 py-0.5 text-xs bg-destructive/10 text-destructive font-semibold">Blocked</span>;
  return <span className="rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">Std</span>;
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtTime(date: string) {
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function authHeader() {
  return {};
}

// ── CSV export ─────────────────────────────────────────────────────────────────

// Same guard as server/api/_utils/validate.ts csvCell: a leading = + - @ tab or CR would run as a spreadsheet formula.
function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// Date filters are whole days in the admin's timezone; the server needs the offset to place the boundaries.
const tzOffset = () => String(new Date().getTimezoneOffset());

function exportCSV(bookings: Booking[]) {
  const rows = [
    // Plain numbers, no ₹ symbol — spreadsheets parse the column as currency
    // from the header, and a symbol in the cell would make it text.
    ["Booking ID", "Event", "User Name", "Email", "Seats", "Amount (INR)", "Status", "Checked-in", "Date"],
    ...bookings.map((b) => [
      b.id,
      b.event?.title ?? "",
      b.user?.name ?? "",
      b.user?.email ?? "",
      b.seats.map((s) => s.label).join("; "),
      b.total_price.toFixed(2),
      b.status,
      b.checked_in ? "Yes" : "No",
      fmt(b.created_at),
    ]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── main component ─────────────────────────────────────────────────────────────

export default function AdminBookings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, isLoading: authLoading } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCheckedIn, setFilterCheckedIn] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterEventId, setFilterEventId] = useState("");
  const [filterEventTitle, setFilterEventTitle] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Read ?eventId= from URL on first mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eid = params.get("eventId") || "";
    if (eid) {
      setFilterEventId(eid);
      setFilterEventTitle(params.get("eventTitle") || eid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dialogs
  const [selected, setSelected] = useState<Booking | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Admin-only: <RequireAdmin> (App.tsx) guards this route, so no page-level redirect here.

  // ── export: every page of the current filters, not just the visible one ──
  const handleExport = useCallback(async () => {
    const MAX_ROWS = 5000;
    setLoading(true);
    try {
      const all: Booking[] = [];
      for (let page = 1; all.length < MAX_ROWS; page++) {
        const params = new URLSearchParams({ page: String(page), limit: "100" });
        if (search.trim()) params.set("search", search.trim());
        if (filterStatus !== "all") params.set("status", filterStatus);
        if (filterCheckedIn !== "all") params.set("checked_in", filterCheckedIn);
        if (filterDateFrom) params.set("dateFrom", filterDateFrom);
        if (filterDateTo) params.set("dateTo", filterDateTo);
        if (filterDateFrom || filterDateTo) params.set("tz", tzOffset());
        if (filterEventId) params.set("eventId", filterEventId);
        const res = await fetch(`/api/admin/bookings-manage?${params}`, {
          headers: { "Content-Type": "application/json", ...authHeader() },
        });
        if (!res.ok) throw new Error((await res.json()).error || "Export failed");
        const json = await res.json();
        all.push(...json.data);
        if (page >= json.pagination.totalPages) break;
      }
      exportCSV(all.slice(0, MAX_ROWS));
      if (all.length >= MAX_ROWS) {
        toast({ title: "Export truncated", description: `Only the first ${MAX_ROWS} bookings were exported. Narrow the filters for the rest.` });
      }
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCheckedIn, filterDateFrom, filterDateTo, filterEventId]);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCheckedIn !== "all") params.set("checked_in", filterCheckedIn);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      if (filterDateFrom || filterDateTo) params.set("tz", tzOffset());
      if (filterEventId) params.set("eventId", filterEventId);

      const res = await fetch(`/api/admin/bookings-manage?${params}`, {
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to fetch");
      const json = await res.json();
      setBookings(json.data);
      setPagination(json.pagination);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCheckedIn, filterDateFrom, filterDateTo, filterEventId]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchBookings(1), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [fetchBookings]);

  // ── update status ──────────────────────────────────────────────────────────
  const updateStatus = async (id: string, status: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/bookings-manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Status updated" });
      fetchBookings(pagination.page);
      if (selected?.id === id) setSelected((b) => b ? { ...b, status: status as Booking["status"] } : b);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // ── toggle check-in ────────────────────────────────────────────────────────
  const toggleCheckin = async (booking: Booking) => {
    setActionLoading(booking.id);
    try {
      const res = await fetch("/api/admin/bookings-manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ id: booking.id, checked_in: !booking.checked_in }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: booking.checked_in ? "Check-in removed" : "Checked in!" });
      fetchBookings(pagination.page);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // ── delete ─────────────────────────────────────────────────────────────────
  const deleteBooking = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/bookings-manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Booking deleted" });
      setDeleteTarget(null);
      fetchBookings(pagination.page);
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const activeFilterCount = [
    filterStatus !== "all",
    filterCheckedIn !== "all",
    !!filterDateFrom,
    !!filterDateTo,
    !!filterEventId,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterCheckedIn("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterEventId("");
    setFilterEventTitle("");
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header bar */}
      <div className="border-b bg-card/50 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex flex-wrap items-center gap-2 md:gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="shrink-0" aria-label="Back to admin dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-section">Booking Management</h1>
          <p className="text-xs text-muted-foreground truncate">
            {filterEventId ? `Filtered by event — ${pagination.total} booking(s)` : `${pagination.total} total bookings`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!bookings.length || loading} className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
          </Button>
          <Button variant="outline" size="icon" onClick={() => fetchBookings(pagination.page)} aria-label="Refresh bookings">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">

        {/* Event filter banner */}
        {filterEventId && (
          <div className="flex flex-wrap items-center gap-2 md:gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 md:px-4 py-2 md:py-2.5">
            <Ticket className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs md:text-sm flex-1 min-w-0 truncate">
              <span className="md:hidden">Event: </span>
              <span className="hidden md:inline">Showing bookings for event: </span>
              <span className="font-semibold text-foreground">{filterEventTitle || filterEventId}</span>
            </span>
            <button
              onClick={() => { setFilterEventId(""); setFilterEventTitle(""); }}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Remove event filter"
              aria-label="Remove event filter"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search + filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Search bookings"
              placeholder="Search by user name, email, event or booking ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="gap-2 shrink-0"
            aria-label="Filters"
            aria-expanded={showFilters}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary text-primary-foreground w-5 h-5 flex items-center justify-center text-xs">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground gap-1 shrink-0">
              <X className="h-3 w-3" /> <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>

        {/* Expandable filters */}
        {showFilters && (
          <div className="rounded-xl border bg-card/60 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label htmlFor="filter-status" className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="filter-status" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="checked-in">Checked-in</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="filter-checkin" className="text-xs font-medium text-muted-foreground">Check-in</label>
              <Select value={filterCheckedIn} onValueChange={setFilterCheckedIn}>
                <SelectTrigger id="filter-checkin" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Checked in</SelectItem>
                  <SelectItem value="false">Not checked in</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="filter-from" className="text-xs font-medium text-muted-foreground">From date</label>
              <Input id="filter-from" type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <label htmlFor="filter-to" className="text-xs font-medium text-muted-foreground">To date</label>
              <Input id="filter-to" type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          {/* Table header - desktop only */}
          <div className="hidden md:grid grid-cols-[1fr_1.2fr_90px_80px_110px_100px_60px] gap-3 px-4 py-2 border-b bg-surface-secondary text-label text-muted-foreground">
            <span>Booking / User</span>
            <span>Event</span>
            <span className="text-center">Seats</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Status</span>
            <span className="text-center">Check-in</span>
            <span />
          </div>

          {loading ? (
            <div className="divide-y">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-4 md:py-3 animate-pulse">
                  {/* Mobile skeleton */}
                  <div className="md:hidden space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-muted rounded w-1/3" />
                        <div className="h-2.5 bg-muted rounded w-1/2" />
                      </div>
                      <div className="h-6 bg-muted rounded-full w-20" />
                    </div>
                    <div className="flex justify-between gap-2">
                      <div className="h-3 bg-muted rounded w-20" />
                      <div className="h-3 bg-muted rounded w-16" />
                      <div className="h-3 bg-muted rounded w-14" />
                    </div>
                  </div>
                  {/* Desktop skeleton */}
                  <div className="hidden md:flex gap-3 items-center">
                    <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-muted rounded w-1/3" />
                      <div className="h-2.5 bg-muted rounded w-1/2" />
                    </div>
                    <div className="h-3 bg-muted rounded w-20" />
                    <div className="h-3 bg-muted rounded w-16" />
                    <div className="h-6 bg-muted rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-20 text-center">
              <Ticket className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium text-muted-foreground">No bookings found</p>
              {(search || activeFilterCount > 0) && (
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col md:grid md:grid-cols-[1fr_1.2fr_90px_80px_110px_100px_60px] gap-3 px-4 py-4 md:py-3 hover:bg-muted/20 transition-colors border-b md:border-b-0 last:border-b-0"
                >
                  {/* Mobile header row */}
                  <div className="flex md:hidden items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-accent flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                        {b.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{b.user?.name ?? "Unknown"}</p>
                        <p className="text-data text-xs text-muted-foreground">{b.id.slice(-8)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={b.status}
                        onValueChange={(v) => updateStatus(b.id, v)}
                        disabled={actionLoading === b.id}
                      >
                        <SelectTrigger className="h-7 text-xs w-auto min-w-[90px] border-0 bg-transparent p-0 focus:ring-0">
                          <SelectValue>{statusBadge(b.status)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="refunded">Refunded</SelectItem>
                          <SelectItem value="checked-in">Checked-in</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Booking + user - desktop */}
                  <div className="hidden md:flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/30 to-accent flex items-center justify-center shrink-0 text-sm font-bold text-primary">
                      {b.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{b.user?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.user?.email ?? "–"}</p>
                      <p className="text-data text-xs text-muted-foreground">{b.id.slice(-8)}</p>
                    </div>
                  </div>

                  {/* Event */}
                  <div className="flex md:block items-center justify-between md:justify-start">
                    <span className="md:hidden text-xs text-muted-foreground">Event:</span>
                    <div className="min-w-0 text-right md:text-left">
                      <p className="text-sm font-medium truncate">{b.event?.title ?? "–"}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.event ? fmt(b.event.date) : "–"}
                      </p>
                    </div>
                  </div>

                  {/* Seats */}
                  <div className="flex md:block items-center justify-between md:justify-center">
                    <span className="md:hidden text-xs text-muted-foreground">Seats:</span>
                    <div className="text-right md:text-center">
                      <span className="text-sm font-semibold">{b.seat_count}</span>
                      <p className="text-[10px] text-muted-foreground hidden md:block">
                        {b.seats.slice(0, 2).map((s) => s.label).join(", ")}
                        {b.seats.length > 2 && ` +${b.seats.length - 2}`}
                      </p>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="flex md:block items-center justify-between md:text-right">
                    <span className="md:hidden text-xs text-muted-foreground">Amount:</span>
                    <span className="text-sm font-semibold">
                      {b.event?.is_free ? <span className="text-success text-xs">Free</span> : formatPrice(b.total_price)}
                    </span>
                  </div>

                  {/* Status dropdown - desktop only */}
                  <div className="hidden md:flex justify-center">
                    <Select
                      value={b.status}
                      onValueChange={(v) => updateStatus(b.id, v)}
                      disabled={actionLoading === b.id}
                    >
                      <SelectTrigger className="h-7 text-xs w-[108px] border-0 bg-transparent p-0 focus:ring-0">
                        <SelectValue>{statusBadge(b.status)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                        <SelectItem value="checked-in">Checked-in</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Check-in toggle */}
                  <div className="flex md:justify-center items-center justify-between">
                    <span className="md:hidden text-xs text-muted-foreground">Check-in:</span>
                    <button
                      type="button"
                      onClick={() => toggleCheckin(b)}
                      disabled={actionLoading === b.id}
                      // The name carries the current state in the same words as the visible text (WCAG 2.5.3); the
                      // title says what activating it does.
                      aria-label={`${b.checked_in ? "Checked" : "Not checked"} in: ${b.user?.name ?? b.user?.email ?? "guest"}`}
                      className="-mx-2 flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      title={b.checked_in ? "Remove check-in" : "Mark checked-in"}
                    >
                      {b.checked_in
                        ? <><CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" /> <span className="md:hidden text-success">Checked</span></>
                        : <><XCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> <span className="md:hidden text-muted-foreground">Not checked</span></>}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 justify-end pt-2 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 md:h-7 md:w-7"
                      onClick={() => setSelected(b)}
                      aria-label="View booking details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 md:h-7 md:w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(b)}
                      aria-label="Delete booking"
                      disabled={actionLoading === b.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="icon" className="h-10 w-10 md:h-8 md:w-8"
                disabled={pagination.page <= 1}
                onClick={() => fetchBookings(pagination.page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium">{pagination.page} / {pagination.totalPages}</span>
              <Button
                variant="outline" size="icon" className="h-10 w-10 md:h-8 md:w-8"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchBookings(pagination.page + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Booking Details
              <span className="font-mono text-xs text-muted-foreground ml-2">#{selected?.id.slice(-10)}</span>
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5">
              {/* Status + timestamps */}
              <div className="flex flex-wrap items-center gap-3">
                {statusBadge(selected.status)}
                {selected.checked_in && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" /> Checked-in {selected.checked_in_at ? fmtTime(selected.checked_in_at) : ""}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {fmt(selected.created_at)} {fmtTime(selected.created_at)}
                </span>
              </div>

              {/* Event info */}
              <div className="rounded-xl border p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Event</h4>
                {selected.event ? (
                  <div className="flex gap-3">
                    {selected.event.image_url && (
                      <img src={selected.event.image_url} alt="" className="h-16 w-24 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="space-y-1">
                      <p className="font-semibold">{selected.event.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{fmt(selected.event.date)} · {fmtTime(selected.event.date)}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{selected.event.location}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant="outline" className="text-[10px]">{selected.event.category}</Badge>
                        {selected.event.is_free
                          ? <Badge variant="outline" className="text-[10px] text-success border-success/30">Free</Badge>
                          : <span className="text-xs font-semibold">{formatPrice(selected.event.price)}</span>}
                      </div>
                    </div>
                  </div>
                ) : <p className="text-muted-foreground text-sm">Event not found</p>}
              </div>

              {/* User info */}
              <div className="rounded-xl border p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">User</h4>
                {selected.user ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium text-foreground">{selected.user.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs truncate">{selected.user.email}</span>
                    </div>
                    {selected.user.phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">{selected.user.phone}</span>
                      </div>
                    )}
                    {selected.user.student_id && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs">{selected.user.student_id}</span>
                      </div>
                    )}
                  </div>
                ) : <p className="text-muted-foreground text-sm">User not found</p>}
              </div>

              {/* Seats */}
              <div className="rounded-xl border p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Seats ({selected.seat_count})
                </h4>
                {selected.seats.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {selected.seats.map((s) => (
                      <div key={s.seat_id} className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-mono font-semibold text-sm">{s.label}</p>
                          <p className="text-xs text-muted-foreground">Row {s.row} · #{s.number}</p>
                        </div>
                        <div className="text-right">
                          {seatTypeBadge(s.seat_type)}
                          <p className="text-xs text-muted-foreground mt-0.5">{formatPrice(s.price)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No seat data</p>}
              </div>

              {/* Payment */}
              <div className="rounded-xl border p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Payment</h4>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Total Paid</span>
                  <span className="text-xl font-bold">
                    {selected.event?.is_free ? "Free" : formatPrice(selected.total_price)}
                  </span>
                </div>
                {selected.booking_note && (
                  <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                    Note: {selected.booking_note}
                  </p>
                )}
              </div>

              {/* Quick status update */}
              <div className="rounded-xl border p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Update Status</h4>
                <div className="flex flex-wrap gap-2">
                  {(["confirmed", "pending", "cancelled", "refunded", "checked-in"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selected.status === s ? "default" : "outline"}
                      className="text-xs h-7"
                      disabled={selected.status === s || actionLoading === selected.id}
                      onClick={() => updateStatus(selected.id, s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setDeleteTarget(selected); setSelected(null); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Booking
            </Button>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the booking for{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.user?.name ?? "this user"}</span>
              {" "}and release their seats. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteBooking(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
