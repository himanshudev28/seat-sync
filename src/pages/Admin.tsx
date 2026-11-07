import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HomepageCuration } from "@/components/admin/HomepageCuration";
import { compareRows, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableCaption,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DEFAULT_TICKET_SETTINGS, ticketSettingsOf, type TicketSettings } from "@/components/ticket/ticketData";
import { TicketFront } from "@/components/ticket/Ticket3D";
import { toLocalDateTimeParts, fromLocalDateTimeParts } from "@/lib/datetime";
import {
  Armchair,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutGrid,
  RotateCcw,
  ScanLine,
  Unlock,
  BarChart3, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  IndianRupee,
  Download, 
  Edit, 
  Eye, 
  Lock, 
  Loader2,
  MoreHorizontal, 
  Plus, 
  Sparkles,
  Ticket, 
  Trash2, 
  TrendingUp, 
  Users, 
  XCircle, 
  Minus 
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";

/** Sentinel option in the category dropdown — Radix rejects an empty value. */
const NEW_CATEGORY = "__new_category__";

/**
 * The seat layout an admin used last, so "Generate seats" for a new event starts
 * from it. Falls back to 15 rows × 16 seats, the layout the live events use.
 */
const LAST_LAYOUT_KEY = "seatsync:last-seat-layout";
function lastSeatLayout(): { rows: number; columns: number } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_LAYOUT_KEY) || "null");
    if (v && v.rows > 0 && v.columns > 0) return { rows: Number(v.rows), columns: Number(v.columns) };
  } catch {
    /* storage blocked: use the default */
  }
  return { rows: 15, columns: 16 };
}

/** Price step between seat tiers; the same rule as server/seatPricing.ts (front cheapest). */
const tierStep = (base: number) => (base > 0 ? Math.max(10, Math.round((base * 0.25) / 10) * 10) : 0);

/** Previous / next for the 50-per-page lists the admin APIs return. */
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <span className="mr-2 text-muted-foreground">
        Page {page} of {total}
      </span>
      <Button size="sm" variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="outline" onClick={() => onPage(page + 1)} disabled={page >= total} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void> | void;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [homepageToggleLoading, setHomepageToggleLoading] = useState<string | null>(null);
  
  // Event form
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("19:00");
  const [eventLocation, setEventLocation] = useState("");
  const [eventPrice, setEventPrice] = useState("");
  const [eventCategory, setEventCategory] = useState("");
  // Swaps the category dropdown for a free-text field when the admin is
  // inventing a category rather than reusing one of the existing ones.
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [eventImageUrl, setEventImageUrl] = useState("");
  const [publishEvent, setPublishEvent] = useState(false);
  const [isFreeEvent, setIsFreeEvent] = useState(false);
  const [maxSeatsPerUser, setMaxSeatsPerUser] = useState(10);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  // What this event's tickets print (issuer, which attendee fields, labels, a note).
  const [ticketSettings, setTicketSettings] = useState<TicketSettings>(DEFAULT_TICKET_SETTINGS);
  const setTicket = <K extends keyof TicketSettings>(k: K, v: TicketSettings[K]) =>
    setTicketSettings((prev) => ({ ...prev, [k]: v }));
  // Guards Save against a double click creating the event twice.
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "upcoming" | "past" | "drafts">("all");
  // One confirm dialog for every destructive action (replaces window.confirm).
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // The last request stays on screen while the dialog animates closed (no empty flash).
  const [shownConfirm, setShownConfirm] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    if (confirmRequest) setShownConfirm(confirmRequest);
  }, [confirmRequest]);
  
  // AI description generation
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [descCooldown, setDescCooldown] = useState(0);

  useEffect(() => {
    if (descCooldown <= 0) return;
    const timer = setTimeout(() => setDescCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [descCooldown]);

  // Seat management state
  const [showSeatDialog, setShowSeatDialog] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventTitle, setSelectedEventTitle] = useState("");
  const [rows, setRows] = useState<string[]>(["A", "B", "C"]);
  const [seatsPerRow, setSeatsPerRow] = useState(15);
  const [seatPrice, setSeatPrice] = useState("");
  const [customLayout, setCustomLayout] = useState(true);
  const [numberOfRows, setNumberOfRows] = useState(15);
  const [numberOfColumns, setNumberOfColumns] = useState(16);
  const [previewVisible, setPreviewVisible] = useState(true);
  // What the database currently holds for the selected event, so the dialog
  // can say what exists before it says what it will create.
  const [existingSeatCount, setExistingSeatCount] = useState(0);
  const [existingSoldCount, setExistingSoldCount] = useState(0);
  const [generatingSeats, setGeneratingSeats] = useState(false);
  
  // Booking details dialog
  const [showBookingDetailsDialog, setShowBookingDetailsDialog] = useState(false);
  const [selectedEventBookings, setSelectedEventBookings] = useState<any[]>([]);
  const [eventBookingsTitle, setEventBookingsTitle] = useState("");
  
  // User details dialog
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  // Search and action loading
  // Per-tab search — used to be a single shared query that filtered all three
  // tables at once. Typing "concert" in Events would also hide bookings/users.
  const [eventSearch, setEventSearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Dashboard-wide stats (true totals, not paginated)
  const [stats, setStats] = useState<{
    events: { total: number; published: number; drafts: number };
    users: { total: number; admins: number; newThisMonth: number };
    bookings: {
      total: number; confirmed: number; cancelled: number; pending: number;
      refunded: number; revenue: number;
    };
    bookingTrend: Array<{ date: string; count: number }>;
    revenueByEvent: Array<{ title: string; revenue: number }>;
    categoryBreakdown: Array<{ category: string; count: number }>;
  } | null>(null);

  // ── Analytics ──────────────────────────────────────────────────────────────
  const [showAnalyticsDialog, setShowAnalyticsDialog] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsTitle, setAnalyticsTitle] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Seat Control ───────────────────────────────────────────────────────────
  const [showSeatControlDialog, setShowSeatControlDialog] = useState(false);
  const [seatCtrlEventId, setSeatCtrlEventId] = useState<string | null>(null);
  const [seatCtrlEventTitle, setSeatCtrlEventTitle] = useState("");
  const [seatCtrlSeats, setSeatCtrlSeats] = useState<any[]>([]);
  const [seatCtrlSelected, setSeatCtrlSelected] = useState<string[]>([]);
  const [seatCtrlLoading, setSeatCtrlLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartSeat, setDragStartSeat] = useState<string | null>(null);
  const [seatCtrlAction, setSeatCtrlAction] = useState<"book" | "vip" | "wheelchair" | "blocked" | "available">("vip");
  const [seatCtrlUserEmail, setSeatCtrlUserEmail] = useState("");
  const [seatCtrlNote, setSeatCtrlNote] = useState("");

  // ── Check-in ───────────────────────────────────────────────────────────────
  const [checkInLoading, setCheckInLoading] = useState<string | null>(null);

  // ── Booking toggle loading (per event) ────────────────────────────────────
  const [bookingToggleLoading, setBookingToggleLoading] = useState<string | null>(null);

  // ── Export users ───────────────────────────────────────────────────────────
  const [exportUsersLoading, setExportUsersLoading] = useState(false);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsTotalPages, setBookingsTotalPages] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);

  // <RequireAdmin> (App.tsx) only renders this page for a signed-in admin, using the session from
  // useAuth(). The page used to re-check /api/auth/me itself and read `data.is_admin`, which broke when /me
  // started answering { user: {...} } and bounced every admin to "/".
  useEffect(() => {
    if (!user) return;
    // Fire all four initial requests in parallel — previously these ran
    // serially (waterfall) since each was just dispatched then ignored.
    void Promise.allSettled([fetchEvents(), fetchBookings(), fetchUsers(), fetchStats()]);
  }, [user]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats", {
      });
      // Swallowing this silently is how the whole dashboard sat at zero for so
      // long — /api/admin/stats 404'd because the route was never registered
      // in api/index.ts, and every tile just rendered its `?? 0` fallback.
      if (!res.ok) {
        console.error("Error fetching stats:", res.status, await res.text().catch(() => ""));
        return;
      }
      setStats(await res.json());
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchEvents = async () => {
    try {
      console.log("Fetching events for admin dashboard");
      // ?fresh=true opts out of the 60s public Cache-Control. The browser
      // cache keys on the URL alone, so without it a re-fetch right after
      // generating seats replayed the pre-generation seat counts.
      const response = await fetch("/api/events?fresh=true&include=past", {
      });
      if (!response.ok) {
        console.error("Error fetching events:", response.status);
        toast({
          title: "Error",
          description: "Failed to load events",
          variant: "destructive",
        });
        return;
      }
      const data = await response.json();
      console.log("Events fetched:", data);
      // Normalise _id → id for all JSX references to event.id
      setEvents(data.map((e: any) => ({ ...e, id: e._id ?? e.id })));
    } catch (err) {
      console.error("Exception in fetchEvents:", err);
    }
  };

  const fetchBookings = async (page = 1) => {
    try {
      const response = await fetch(`/api/bookings/admin?page=${page}`, {
      });
      if (!response.ok) {
        console.error("Error fetching bookings:", response.status);
        return;
      }
      const result = await response.json();
      setBookings(result.data || result);
      if (result.pagination) {
        setBookingsPage(result.pagination.page);
        setBookingsTotalPages(result.pagination.totalPages);
      }
    } catch (err) {
      console.error("Error fetching bookings:", err);
      toast({
        title: "Error",
        description: "Failed to load bookings data",
        variant: "destructive",
      });
    }
  };

  const fetchUsers = async (page = 1) => {
    try {
      const response = await fetch(`/api/auth/users?page=${page}`, {
      });
      if (!response.ok) {
        console.error("Error fetching users:", response.status);
        return;
      }
      const result = await response.json();
      setUsers(result.data || result);
      if (result.pagination) {
        setUsersPage(result.pagination.page);
        setUsersTotalPages(result.pagination.totalPages);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
      toast({
        title: "Error",
        description: "Failed to load users data",
        variant: "destructive",
      });
    }
  };

  const fetchEventBookings = async (eventId: string, eventTitle: string) => {
    try {
      const response = await fetch(`/api/bookings/admin?eventId=${eventId}&limit=200`, {
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load bookings");
      }
      const result = await response.json();
      // API returns { data: [], pagination: {} } – extract the array
      const bookingsArray = Array.isArray(result) ? result : (result.data ?? []);
      setSelectedEventBookings(bookingsArray);
      setEventBookingsTitle(eventTitle);
      setShowBookingDetailsDialog(true);
    } catch (error: any) {
      console.error("Error fetching event bookings:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load bookings",
        variant: "destructive",
      });
    }
  };


  // Function to export bookings as CSV
  const exportBookingsCSV = async (eventId: string, eventTitle: string) => {
    if (!user) return;
    
    setExportLoading(eventId);
    
    try {
      const response = await fetch(`/api/bookings/export?eventId=${eventId}`, {
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to export bookings");
      }

      // API returns the CSV directly as a blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `${eventTitle}-bookings.csv`;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Bookings exported successfully",
      });
    } catch (error: any) {
      console.error("Error exporting bookings:", error);
      toast({
        title: "Export Failed",
        description: error.message || "Could not export bookings",
        variant: "destructive",
      });
    } finally {
      setExportLoading(null);
    }
  };

  const generateAIDescription = async () => {
    if (!eventTitle || !eventCategory) {
      toast({ title: "Missing fields", description: "Enter event title and category first.", variant: "destructive" });
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const res = await fetch("/api/admin/generate-description", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: eventTitle, category: eventCategory, imageUrl: eventImageUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setEventDescription(data.description);
      setDescCooldown(15);
      toast({ title: "Description generated!", description: "AI description has been filled in. Feel free to edit it." });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const openCreateEventDialog = () => {
    resetEventForm();
    setShowEventDialog(true);
  };

  const openEditEventDialog = (event: any) => {
    setCurrentEventId(event.id);
    setEventTitle(event.title);
    setEventDescription(event.description);
    
    // Format date and time
    // Both parts from local fields (the old UTC date + local time split a day in IST).
    const { date: dateString, time: timeString } = toLocalDateTimeParts(event.date);
    setEventDate(dateString);
    setEventTime(timeString);
    
    setEventLocation(event.location);
    setEventPrice(event.price.toString());
    setEventCategory(event.category ?? "");
    setCreatingCategory(false);
    setEventImageUrl(event.image_url || "");
    setPublishEvent(event.is_published);
    setIsFreeEvent(event.is_free || false);
    setMaxSeatsPerUser(event.max_seats_per_user || 10);
    setTicketSettings(ticketSettingsOf(event));

    setShowEventDialog(true);
  };

  const resetEventForm = () => {
    setCurrentEventId(null);
    setEventTitle("");
    setEventDescription("");
    setEventDate("");
    setEventTime("19:00");
    setEventLocation("");
    setEventPrice("");
    setEventCategory("");
    setCreatingCategory(false);
    setEventImageUrl("");
    setPublishEvent(false);
    setIsFreeEvent(false);
    setMaxSeatsPerUser(10);
    setTicketSettings(DEFAULT_TICKET_SETTINGS);
    setDescCooldown(0);
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create events",
        variant: "destructive",
      });
      return;
    }
    
    // Validate form
    if (!eventTitle || !eventDescription || !eventDate || !eventLocation || (!isFreeEvent && !eventPrice) || !eventCategory.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    if (savingEvent) return;
    setSavingEvent(true);
    try {
      // Combine date and time
      const dateTime = fromLocalDateTimeParts(eventDate, eventTime);

      // Snap a freshly typed category onto an existing one that differs only
      // by case, so "music" doesn't sit beside "Music" in the Browse-by bar.
      const typed = eventCategory.trim();
      const category =
        existingCategories.find((c) => c.toLowerCase() === typed.toLowerCase()) ?? typed;

      const eventData = {
        title: eventTitle,
        description: eventDescription,
        date: dateTime.toISOString(),
        location: eventLocation,
        price: isFreeEvent ? 0 : parseFloat(eventPrice),
        category,
        image_url: eventImageUrl || null,
        is_published: publishEvent,
        created_by: user.id, // Ensure this is set to the current user's ID
        is_free: isFreeEvent,
        max_seats_per_user: maxSeatsPerUser,
        ticket_settings: {
          ...ticketSettings,
          issuer: ticketSettings.issuer?.trim() || null,
          note: ticketSettings.note?.trim() || null,
        },
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };

      let response: Response;
      if (currentEventId) {
        // Update existing event
        response = await fetch(`/api/events/${currentEventId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(eventData),
        });
      } else {
        // Create new event
        response = await fetch("/api/events", {
          method: "POST",
          headers,
          body: JSON.stringify(eventData),
        });
      }

      const result = await response.json();
      if (!response.ok) {
        console.error("Error result:", result);
        throw new Error(result.error || "Failed to save event");
      }
      
      toast({
        title: "Success",
        description: currentEventId ? "Event updated successfully" : "Event created successfully",
      });
      
      fetchEvents();
      void fetchStats();
      // The home page and /events build their category bar from a cached
      // React Query entry; drop it so a brand-new category shows up as soon
      // as the admin navigates there instead of up to 5 minutes later.
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      if (currentEventId) void queryClient.invalidateQueries({ queryKey: ["event", currentEventId] });
      setShowEventDialog(false);
    } catch (error: any) {
      console.error("Error saving event:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save event",
        variant: "destructive",
      });
    } finally {
      setSavingEvent(false);
    }
  };

  // Confirmation happens in the shared dialog (see askDelete) before this runs.
  const deleteEvent = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete event");
      }
      
      toast({
        title: "Success",
        description: "Event deleted successfully",
      });
      
      fetchEvents();
      fetchBookings();
      void fetchStats();
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    } catch (error: any) {
      console.error("Error deleting event:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete event",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Prefill the dialog with the layout that is actually in the database.
   * It used to hard-reset to 15×15 every time, so after generating (say) a
   * 15×16 map the dialog reopened claiming 15×15 / 225 seats — the layout
   * shown here disagreed with the one the event page rendered.
   */
  const openManageSeatsDialog = (event: any) => {
    setSelectedEventId(event.id);
    setSelectedEventTitle(event.title);
    setCustomLayout(true); // Default to custom layout
    // An event's own layout first; a new event starts from the layout used last.
    const last = lastSeatLayout();
    setNumberOfRows(event.seat_rows > 0 ? event.seat_rows : last.rows);
    setNumberOfColumns(event.seat_columns > 0 ? event.seat_columns : last.columns);
    setExistingSeatCount(event.total_seats ?? 0);
    setExistingSoldCount(event.sold_seats ?? 0);
    setSeatPrice(event.price.toString());
    setShowSeatDialog(true);
  };

  const generateRowLetters = (count: number) => {
    const letters = [];
    for (let i = 0; i < count; i++) {
      // Generate row letters (A, B, C, ..., Z, AA, AB, ...)
      if (i < 26) {
        letters.push(String.fromCharCode(65 + i));
      } else {
        const first = String.fromCharCode(65 + Math.floor((i - 26) / 26));
        const second = String.fromCharCode(65 + ((i - 26) % 26));
        letters.push(first + second);
      }
    }
    return letters;
  };

  const handleSeatGeneration = async () => {
    if (!selectedEventId || !seatPrice) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    if (existingSeatCount > 0) {
      setConfirmRequest({
        title: `Replace the ${existingSeatCount}-seat layout?`,
        description:
          existingSoldCount > 0
            ? `Every booking for "${selectedEventTitle}" will be cancelled (${existingSoldCount} seat(s) are sold). This can't be undone.`
            : `The current seats for "${selectedEventTitle}" are replaced with the new layout.`,
        confirmLabel: "Replace layout",
        run: runSeatGeneration,
      });
      return;
    }
    await runSeatGeneration();
  };

  const runSeatGeneration = async () => {
    if (!selectedEventId) return;
    setGeneratingSeats(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      // The API handles seat deletion + generation server-side atomically
      const response = await fetch("/api/seats/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          eventId: selectedEventId,
          seatPrice,
          customLayout,
          rows,
          seatsPerRow,
          numberOfRows,
          numberOfColumns,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create seats");

      toast({
        title: "Success",
        // Report the grid the server actually wrote, not the one requested.
        description:
          `${result.count} seats created (${result.rows} rows × ${result.columns} per row)` +
          (result.cancelledBookings > 0 ? `. ${result.cancelledBookings} booking(s) cancelled.` : ""),
      });
      try {
        localStorage.setItem(LAST_LAYOUT_KEY, JSON.stringify({ rows: result.rows, columns: result.columns }));
      } catch {
        /* storage blocked: fine */
      }
      setShowSeatDialog(false);
      // Without this the events table kept showing the seat counts from before
      // the regeneration until a full page reload.
      await fetchEvents();
      void fetchStats();
    } catch (error: any) {
      console.error("Error creating seats:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create seats",
        variant: "destructive",
      });
    } finally {
      setGeneratingSeats(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: string) => {
    setActionLoading(bookingId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await fetch("/api/bookings/status", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ bookingId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update booking");
      toast({ title: "Updated", description: `Booking marked as ${status}` });
      fetchBookings(bookingsPage);
      void fetchStats();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleAdminRole = async (userId: string, makeAdmin: boolean) => {
    setActionLoading(userId);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await fetch("/api/auth/update-role", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ userId, is_admin: makeAdmin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update role");
      toast({
        title: "Success",
        description: makeAdmin ? "User promoted to admin" : "Admin role removed",
      });
      fetchUsers(usersPage);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const duplicateEvent = async (event: any) => {
    setActionLoading(event.id + "-dup");
    try {
      const { id, _id, __v, created_at, updated_at, createdAt, updatedAt, ...eventData } = event;
      const newEvent = {
        ...eventData,
        title: `${event.title} (Copy)`,
        is_published: false,
        // A copy starts off the home page: copying these used to sneak a third spotlight past the cap.
        is_featured: false,
        is_spotlight: false,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_by: user?.id,
      };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await fetch("/api/events", {
        method: "POST",
        headers,
        body: JSON.stringify(newEvent),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to duplicate event");
      toast({ title: "Duplicated", description: "Event copied as draft" });
      fetchEvents();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const resetEventSeats = async (eventId: string, eventTitle: string) => {
    // Confirmed in the shared dialog before this runs.
    setActionLoading(eventId + "-reset");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await fetch("/api/seats/reset", {
        method: "POST",
        headers,
        body: JSON.stringify({ eventId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to reset seats");
      toast({ title: "Reset", description: `${result.seatsReset} seats for "${eventTitle}" are available again` });
      fetchBookings();
      void fetchEvents();
      void fetchStats();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const fetchEventAnalytics = async (eventId: string, title: string) => {
    setAnalyticsTitle(title);
    setAnalyticsData(null);
    setAnalyticsLoading(true);
    setShowAnalyticsDialog(true);
    try {
      const res = await fetch(`/api/admin/analytics?eventId=${eventId}`, {
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load analytics");
      setAnalyticsData(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setShowAnalyticsDialog(false);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const openSeatControl = async (event: any) => {
    setSeatCtrlEventId(event.id);
    setSeatCtrlEventTitle(event.title);
    setSeatCtrlSelected([]);
    setSeatCtrlAction("vip");
    setSeatCtrlUserEmail("");
    setSeatCtrlNote("");
    setShowSeatControlDialog(true);
    setSeatCtrlLoading(true);
    try {
      const res = await fetch(`/api/seats?eventId=${event.id}`, {
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load seats");
      setSeatCtrlSeats(Array.isArray(data) ? data : data.seats ?? []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSeatCtrlLoading(false);
    }
  };

  const toggleSeatCtrlSelect = (seatId: string, isDrag = false) => {
    if (isDrag && !isDragging) return;
    setSeatCtrlSelected((prev) => {
      if (isDrag && dragStartSeat) {
        const seatIdx = seatCtrlSeats.findIndex((s) => (s._id ?? s.id) === seatId);
        const startIdx = seatCtrlSeats.findIndex((s) => (s._id ?? s.id) === dragStartSeat);
        if (seatIdx !== -1 && startIdx !== -1) {
          const min = Math.min(seatIdx, startIdx);
          const max = Math.max(seatIdx, startIdx);
          const newSelection = seatCtrlSeats.slice(min, max + 1).map((s) => s._id ?? s.id);
          return [...new Set([...prev, ...newSelection])];
        }
      }
      return prev.includes(seatId) ? prev.filter((id) => id !== seatId) : [...prev, seatId];
    });
  };

  const handleSeatMouseDown = (seatId: string) => {
    setIsDragging(true);
    setDragStartSeat(seatId);
    toggleSeatCtrlSelect(seatId);
  };

  const handleSeatMouseEnter = (seatId: string) => {
    if (isDragging && dragStartSeat) {
      toggleSeatCtrlSelect(seatId, true);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStartSeat(null);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [isDragging, dragStartSeat]);

  const executeSeatCtrlAction = async () => {
    if (!seatCtrlSelected.length || !seatCtrlEventId) return;
    setSeatCtrlLoading(true);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      if (seatCtrlAction === "book") {
        const res = await fetch("/api/admin/booking", {
          method: "POST",
          headers,
          body: JSON.stringify({
            eventId: seatCtrlEventId,
            seatIds: seatCtrlSelected,
            targetUserEmail: seatCtrlUserEmail || undefined,
            booking_note: seatCtrlNote || "Admin VIP/manual booking",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to book seats");
        toast({ title: "Booked!", description: `${data.seats_booked} seat(s) booked successfully.` });
      } else {
        const seat_type = seatCtrlAction === "available" ? "standard" : seatCtrlAction;
        const res = await fetch("/api/admin/seat-type", {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            seatIds: seatCtrlSelected,
            seat_type,
            forceStatus: seatCtrlAction === "available" ? "available" : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update seats");
        if (seatCtrlAction === "available" && data.cancelledBookings > 0) {
          toast({
            title: "✅ Seats Reset",
            description: `${data.modified} seat(s) freed. ${data.cancelledBookings} booking(s) cancelled and removed from user's tickets.`,
          });
        } else {
          toast({ title: "Updated!", description: `${data.modified} seat(s) marked as ${seatCtrlAction}.` });
        }
      }
      setSeatCtrlSelected([]);
      await openSeatControl({ id: seatCtrlEventId, title: seatCtrlEventTitle });
      fetchBookings();
      // Booking/blocking seats moves the "Sold" tally behind the dialog.
      void fetchEvents();
      void fetchStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSeatCtrlLoading(false);
    }
  };

  const toggleCheckIn = async (bookingId: string, currentVal: boolean) => {
    setCheckInLoading(bookingId);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const res = await fetch("/api/admin/checkin", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ bookingId, checked_in: !currentVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update check-in");
      toast({ title: !currentVal ? "Checked In ✓" : "Check-in Removed", description: `Booking ${bookingId.substring(0, 8)} updated.` });
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, checked_in: !currentVal } : b))
      );
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckInLoading(null);
    }
  };

  const exportUsersCSV = async () => {
    setExportUsersLoading(true);
    try {
      const res = await fetch("/api/admin/export-users", {
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users-export.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Exported!", description: "User database downloaded as CSV." });
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    } finally {
      setExportUsersLoading(false);
    }
  };

  // ── Ban User ───────────────────────────────────────────────────────────────
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banContext, setBanContext] = useState<{ eventId?: string; eventTitle?: string; userId?: string; userEmail?: string }>({});

  const banUserFromEvent = async (eventId: string, userId: string) => {
    try {
      const res = await fetch("/api/admin/event-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json",  },
        body: JSON.stringify({ eventId, action: "ban_user", userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to ban user");
      toast({ title: "Banned", description: "User banned from this event" });
      fetchEvents();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const unbanUserFromEvent = async (eventId: string, userId: string) => {
    try {
      const res = await fetch("/api/admin/event-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json",  },
        body: JSON.stringify({ eventId, action: "unban_user", userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unban user");
      toast({ title: "Unbanned", description: "User unbanned from this event" });
      fetchEvents();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleBookings = async (event: any) => {
    setBookingToggleLoading(event.id);
    try {
      const res = await fetch("/api/admin/event-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, action: "toggle_bookings" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle bookings");
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_bookings_open: data.is_bookings_open } : e)));
      toast({
        title: data.is_bookings_open ? "Bookings opened" : "Bookings closed",
        description: data.is_bookings_open ? "People can book seats again." : "No new bookings until you reopen.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      fetchEvents();
    } finally {
      setBookingToggleLoading(null);
    }
  };

  const askDelete = (event: any) =>
    setConfirmRequest({
      title: `Delete "${event.title}"?`,
      description: "Its seats and every booking for it are deleted too. This can't be undone.",
      confirmLabel: "Delete event",
      run: () => deleteEvent(event.id),
    });

  const askReset = (event: any) =>
    setConfirmRequest({
      title: `Free every seat for "${event.title}"?`,
      description: "All seats become available and all bookings for this event are cancelled. This can't be undone.",
      confirmLabel: "Reset seats",
      run: () => resetEventSeats(event.id, event.title),
    });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPublishStatusBadge = (isPublished: boolean) => {
    return isPublished ? (
      <Badge className="bg-success/10 text-success">Published</Badge>
    ) : (
      <Badge variant="outline" className="border-warning/40 text-warning">
        Draft
      </Badge>
    );
  };

  const renderSeatPreview = () => {
    if (!previewVisible) return null;
    
    // Full row list, not the first six — the sections below slice out of it by
    // index, so truncating here would leave the balcony section empty.
    const previewRows = customLayout
      ? generateRowLetters(numberOfRows)
      : rows.slice(0, Math.min(rows.length, 6));


    const previewColumns = customLayout ?
      Math.min(numberOfColumns, 15) :
      Math.min(seatsPerRow, 15);
      
    return (
      <div className="border p-4 rounded-md bg-surface-secondary mt-4">
        <h4 className="text-center font-semibold mb-2">Seating Preview</h4>
        
        {/*
          Sections are drawn in the order the ticket page draws them —
          screen first, then Front / Back / Balcony as the rows run A, B, C…
          The old preview printed the sections upside down and put the STAGE
          at the bottom, so row A was labelled "BALCONY" here and "Front" on
          the event page.
        */}
        {customLayout && (() => {
          const sectionSize = Math.ceil(numberOfRows / 3);
          // Same tiers the server writes (server/seatPricing.ts): front cheapest, balcony dearest.
          // The old labels said the opposite ("front: base + ₹5").
          const base = parseFloat(seatPrice) || 0;
          const step = tierStep(base);
          const sections = [
            { name: "FRONT", rows: previewRows.slice(0, Math.min(sectionSize, 2)), price: base },
            { name: "BACK", rows: previewRows.slice(sectionSize, sectionSize + 2), price: base + step },
            { name: "BALCONY", rows: previewRows.slice(sectionSize * 2, sectionSize * 2 + 2), price: base + 2 * step },
          ].filter((s) => s.rows.length > 0);

          return (
            <div className="flex flex-col items-center">
              <div className="bg-muted w-1/2 mx-auto text-center py-1 text-xs rounded-b-lg mb-3">
                SCREEN
              </div>

              {sections.map((section) => (
                <div key={section.name} className="w-full flex flex-col items-center">
                  <div className="bg-muted w-3/4 mx-auto text-center py-1 text-xs mb-1">
                    {section.name}
                    <span className="text-muted-foreground">
                      {" · "}
                      {section.price > 0 ? formatPrice(section.price, { whole: true }) : "Free"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 mb-4">
                    {section.rows.map((row) => (
                      <div key={`preview-${row}`} className="flex gap-1">
                        <span className="text-xs w-4">{row}</span>
                        {[...Array(previewColumns)].map((_, j) => (
                          <div key={`seat-${row}-${j}`} className="w-4 h-4 bg-secondary rounded-sm flex items-center justify-center text-[8px]">
                            {j + 1}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        
        {!customLayout && (
          <div className="flex flex-col items-center">
            {previewRows.map((row, i) => (
              <div key={`preview-row-${i}`} className="flex gap-1 mb-1">
                <span className="text-xs w-4">{row}</span>
                {[...Array(previewColumns)].map((_, j) => (
                  <div key={`seat-${i}-${j}`} className="w-4 h-4 bg-secondary rounded-sm flex items-center justify-center text-[8px]">
                    {j+1}
                  </div>
                ))}
              </div>
            ))}
            
            <div className="bg-muted w-1/2 mx-auto text-center py-1 text-xs rounded-t-lg mt-4">
              STAGE
            </div>
          </div>
        )}
        
        <p className="text-xs text-center mt-4 text-muted-foreground">
          This is just a preview. The actual layout will have {customLayout ? numberOfRows : rows.length} rows and {customLayout ? numberOfColumns : seatsPerRow} seats per row.
        </p>
      </div>
    );
  };

  /**
   * Toggle whether an event appears in the home page's featured grid or as one
   * of the two hero spotlight cards. The server owns the 2-card spotlight cap
   * and returns 409 when it's reached, so the message comes straight from it.
   */
  const toggleHomepageFlag = async (eventId: string, flag: "featured" | "spotlight") => {
    setHomepageToggleLoading(`${eventId}:${flag}`);
    try {
      const res = await fetch("/api/admin/event-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json",  },
        body: JSON.stringify({ eventId, action: flag === "featured" ? "toggle_featured" : "toggle_spotlight" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the home page");
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? { ...e, is_featured: data.is_featured, is_spotlight: data.is_spotlight }
            : e
        )
      );
    } catch (err: any) {
      toast({ title: "Home page not updated", description: err.message, variant: "destructive" });
    } finally {
      setHomepageToggleLoading(null);
    }
  };

  // Memoised filters — recompute only when source data or its tab's query
  // changes. Must be declared BEFORE any conditional early return so the hook
  // count stays consistent between renders (React error #310 otherwise).
  /**
   * Every category already in use, drafts included — the source for the
   * create/edit dropdown. Deriving it from the events we already hold keeps
   * it in step with the home page's "Browse by" bar, which is built from the
   * same stored values (via /api/events?facets=true, published events only).
   *
   * Deduped case-insensitively so "Music" and "music" can't become two pills.
   */
  const existingCategories = useMemo(() => {
    const byLower = new Map<string, string>();
    for (const e of events) {
      const label = String(e.category ?? "").trim();
      if (label && !byLower.has(label.toLowerCase())) {
        byLower.set(label.toLowerCase(), label);
      }
    }
    // The event being edited may spell its category differently from the one
    // that won the dedupe; without this the trigger would fall back to the
    // placeholder and look like nothing was selected. Skipped while a new
    // category is being typed, or the field would flip to a dropdown mid-word.
    const current = eventCategory.trim();
    if (current && !creatingCategory) byLower.set(current.toLowerCase(), current);
    return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b));
  }, [events, eventCategory, creatingCategory]);

  const isPastEvent = (e: any) => new Date(e.date).getTime() < Date.now();

  const eventCounts = useMemo(
    () => ({
      all: events.length,
      upcoming: events.filter((e) => e.is_published && !isPastEvent(e)).length,
      past: events.filter((e) => isPastEvent(e)).length,
      drafts: events.filter((e) => !e.is_published).length,
    }),
    [events],
  );

  // Upcoming first (soonest at the top), then past events (most recent first).
  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    const inFilter = (e: any) =>
      eventFilter === "all" ||
      (eventFilter === "upcoming" && e.is_published && !isPastEvent(e)) ||
      (eventFilter === "past" && isPastEvent(e)) ||
      (eventFilter === "drafts" && !e.is_published);
    const matches = (e: any) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      (e.location || "").toLowerCase().includes(q) ||
      (e.category || "").toLowerCase().includes(q);
    const t = (e: any) => new Date(e.date).getTime();
    return events
      .filter((e) => inFilter(e) && matches(e))
      .sort((a, b) => {
        const pa = isPastEvent(a);
        const pb = isPastEvent(b);
        if (pa !== pb) return pa ? 1 : -1;
        return pa ? t(b) - t(a) : t(a) - t(b);
      });
  }, [events, eventSearch, eventFilter]);

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        (b.events?.title || "").toLowerCase().includes(q) ||
        (b.profiles?.first_name || "").toLowerCase().includes(q) ||
        (b.profiles?.last_name || "").toLowerCase().includes(q) ||
        (b.profiles?.email || "").toLowerCase().includes(q)
    );
  }, [bookings, bookingSearch]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.first_name || "").toLowerCase().includes(q) ||
        (u.last_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  // Chart data — derived from `stats` (true totals) so it always reflects the
  // full dataset, not just the current paginated page.
  // Every one of the last 30 days, zeros included: the API only lists days that had
  // bookings, which drew a lone dot (or nothing) instead of a trend.
  const bookingTrendData = useMemo(() => {
    const counts = new Map((stats?.bookingTrend ?? []).map((d) => [d.date, d.count]));
    const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.now() - (29 - i) * 86_400_000);
      const key = day.toISOString().slice(0, 10);
      return { date: label.format(day), count: counts.get(key) ?? 0 };
    });
  }, [stats?.bookingTrend]);
  const revenueByEventData = useMemo(
    () => (stats?.revenueByEvent ?? []).map((r) => ({ title: r.title ?? "Unknown", amount: r.revenue })),
    [stats?.revenueByEvent]
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[clamp(2.75rem,6vw,4.25rem)] font-extrabold uppercase leading-[0.85]">
            Admin <span className="text-primary">dashboard</span>
          </h1>
          <p className="mt-3 text-muted-foreground">Events, seats, bookings and people in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/scan">
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Scan tickets
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/admin/bookings">
              <Ticket className="h-4 w-4" aria-hidden="true" />
              Manage bookings
            </Link>
          </Button>
          <Button onClick={openCreateEventDialog} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New event
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="events">
            Events <span aria-hidden="true" className="ml-1.5 tabular-nums opacity-70">{stats?.events.total ?? events.length}</span>
          </TabsTrigger>
          <TabsTrigger value="homepage">Home page</TabsTrigger>
          <TabsTrigger value="bookings">
            Bookings <span aria-hidden="true" className="ml-1.5 tabular-nums opacity-70">{stats?.bookings.total ?? bookings.length}</span>
          </TabsTrigger>
          <TabsTrigger value="users">
            Users <span aria-hidden="true" className="ml-1.5 tabular-nums opacity-70">{stats?.users.total ?? users.length}</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview">
          {/* KPI Cards — sourced from /api/admin/stats so they show TRUE totals,
              not just the currently-fetched paginated page. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold">{stats?.events.total ?? events.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.events.published ?? events.filter(e => e.is_published).length} published
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Total Bookings</p>
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold">{stats?.bookings.total ?? bookings.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.bookings.confirmed ?? bookings.filter((b: any) => b.status === 'confirmed').length} confirmed
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold">{stats?.users.total ?? users.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.users.admins ?? users.filter((u: any) => u.is_admin).length} admins
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <IndianRupee className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold">
                  {formatPrice(stats?.bookings.revenue ?? 0, { whole: true })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">confirmed bookings</p>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking Trend (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {/* SVG colour attributes can't read CSS variables, so the series use currentColor. */}
                <div className="text-primary">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={bookingTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} interval={6} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" name="Bookings" stroke="currentColor" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue by Event</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-primary">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={revenueByEventData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="title" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} width={44} />
                      <Tooltip formatter={(v: number) => formatPrice(v, { whole: true })} />
                      {/* currentColor: the bars rendered invisible with fill="hsl(var(--primary))". */}
                      <Bar dataKey="amount" name="Revenue" fill="currentColor" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Booking Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {([
                  { label: 'Confirmed', key: 'confirmed', icon: <CheckCircle2 className="h-4 w-4 text-success" /> },
                  { label: 'Cancelled', key: 'cancelled', icon: <XCircle className="h-4 w-4 text-destructive" /> },
                  { label: 'Pending',   key: 'pending',   icon: <Clock className="h-4 w-4 text-warning" /> },
                ] as const).map(({ label, key, icon }) => {
                  const count = stats?.bookings[key] ?? bookings.filter((b: any) => b.status === key).length;
                  const total = stats?.bookings.total ?? bookings.length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">{icon}<span className="text-sm">{label}</span></div>
                        <span className="text-sm font-medium">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${ key === 'confirmed' ? 'bg-success' : key === 'cancelled' ? 'bg-destructive' : 'bg-warning' }`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Events by Category */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Events by Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const cats = stats?.categoryBreakdown;
                  if (!cats || cats.length === 0) {
                    return <p className="text-sm text-muted-foreground">No events yet</p>;
                  }
                  const total = cats.reduce((sum, c) => sum + c.count, 0) || 1;
                  return cats.map(({ category, count }) => (
                    <div key={category}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">{category}</span>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((count / total) * 100)}%` }} />
                      </div>
                    </div>
                  ));
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Recent Bookings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Bookings</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No bookings yet</p>
              ) : (
                <div className="overflow-auto max-h-[70vh] rounded-xl border">
                  <Table>
                    <TableCaption className="sr-only">Recent bookings</TableCaption>
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.slice(0, 8).map((b: any) => (
                        <TableRow key={b._id ?? b.id}>
                          <TableCell className="font-medium text-sm">{b.event?.title ?? b.events?.title ?? '—'}</TableCell>
                          <TableCell className="text-sm">{b.user?.email ?? b.profiles?.email ?? '—'}</TableCell>
                          <TableCell className="text-sm">{(b.events?.is_free || b.is_free) ? <span className="text-success font-medium">Free</span> : formatPrice(b.total_price ?? 0)}</TableCell>
                          <TableCell>
                            <Badge className={b.status === 'confirmed' ? 'bg-success/10 text-success' : b.status === 'cancelled' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>
                              {b.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(b.created_at ?? b.createdAt ?? '')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div role="group" aria-label="Show events" className="flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "All"],
                      ["upcoming", "Upcoming"],
                      ["past", "Past"],
                      ["drafts", "Drafts"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEventFilter(key)}
                      aria-pressed={eventFilter === key}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        eventFilter === key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                      <span className="tabular-nums opacity-70">{eventCounts[key]}</span>
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="Search title, place or category"
                  aria-label="Search events"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="lg:max-w-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredEvents.length === 0 ? (
                <div className="border-t border-border px-6 py-14 text-center">
                  <p className="font-display text-2xl font-extrabold uppercase">
                    {events.length === 0 ? "No events yet" : "Nothing matches"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {events.length === 0 ? "Create your first event to start selling seats." : "Try another filter or search."}
                  </p>
                  {events.length === 0 && (
                    <Button onClick={openCreateEventDialog} className="mt-6 gap-2">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      New event
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {filteredEvents.map((event) => {
                    const when = new Date(event.date);
                    const past = isPastEvent(event);
                    const total = event.total_seats || 0;
                    const sold = event.sold_seats || 0;
                    const pct = total ? Math.round((sold / total) * 100) : 0;
                    const open = event.is_bookings_open !== false;
                    const busy =
                      (!!actionLoading && actionLoading.startsWith(event.id)) ||
                      bookingToggleLoading === event.id ||
                      exportLoading === event.id;
                    return (
                      <li key={event.id} className="flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <div
                            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${
                              past ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"
                            }`}
                            aria-hidden="true"
                          >
                            <span className="font-display text-2xl font-extrabold leading-none">{when.getDate()}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {when.toLocaleString("en-US", { month: "short" })}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold text-foreground">{event.title}</p>
                              {!event.is_published ? (
                                <Badge variant="outline" className="border-warning/40 text-warning">Draft</Badge>
                              ) : past ? (
                                <Badge variant="outline" className="text-muted-foreground">Past</Badge>
                              ) : (
                                <Badge className="bg-success/10 text-success hover:bg-success/10">Live</Badge>
                              )}
                              {!open && !past && (
                                <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
                                  <Lock className="h-3 w-3" aria-hidden="true" />
                                  Bookings closed
                                </Badge>
                              )}
                              {event.is_spotlight && <Badge variant="outline" className="border-primary/30 text-primary">Spotlight</Badge>}
                              {event.is_featured && <Badge variant="outline">Featured</Badge>}
                            </div>
                            <p className="mt-0.5 truncate text-sm text-muted-foreground">
                              {[event.category, event.location, formatDate(event.date)].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>

                        <div className="w-full md:w-48">
                          {total > 0 ? (
                            <>
                              <div className="mb-1 flex justify-between text-xs">
                                <span className="text-muted-foreground">Seats sold</span>
                                <span className="font-mono font-semibold">
                                  {sold}/{total}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openManageSeatsDialog(event)}
                              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                            >
                              No seats yet · generate
                            </button>
                          )}
                        </div>

                        <div className="w-20 font-mono text-sm font-semibold md:text-right">
                          {event.is_free ? "Free" : formatPrice(event.price, { whole: true })}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEditEventDialog(event)} aria-label={`Edit ${event.title}`}>
                            <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => (total > 0 ? openSeatControl(event) : openManageSeatsDialog(event))}
                            aria-label={`Seats for ${event.title}`}
                          >
                            <Armchair className="h-3.5 w-3.5" aria-hidden="true" />
                            Seats
                          </Button>
                          {/* modal={false}: menu items open dialogs, and a modal menu would leave the page unclickable. */}
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`More actions for ${event.title}`}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onSelect={() => navigate(`/admin/bookings?eventId=${event.id}`)}>
                                <Ticket className="mr-2 h-4 w-4" aria-hidden="true" />
                                View bookings
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => fetchEventAnalytics(event.id, event.title)}>
                                <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Analytics
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => exportBookingsCSV(event.id, event.title)} disabled={exportLoading === event.id}>
                                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                                Export bookings CSV
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/events/${event.id}`}>
                                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                                  Open event page
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => openManageSeatsDialog(event)}>
                                <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" />
                                Seat layout…
                              </DropdownMenuItem>
                              {!past && (
                                <DropdownMenuItem onSelect={() => toggleBookings(event)} disabled={bookingToggleLoading === event.id}>
                                  {open ? <Lock className="mr-2 h-4 w-4" aria-hidden="true" /> : <Unlock className="mr-2 h-4 w-4" aria-hidden="true" />}
                                  {open ? "Close bookings" : "Open bookings"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => duplicateEvent(event)}>
                                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                                Duplicate as draft
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => askReset(event)} disabled={total === 0}>
                                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                                Free all seats…
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => askDelete(event)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Delete event…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="homepage">
          <HomepageCuration
            events={events}
            onToggle={toggleHomepageFlag}
            pendingId={homepageToggleLoading}
          />
        </TabsContent>

        <TabsContent value="bookings">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-card-title">Bookings Overview</h2>
            <Button size="sm" onClick={() => navigate("/admin/bookings")}>
              Open Full Management →
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-data text-2xl font-bold">{stats?.bookings.total ?? bookings.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-data text-2xl font-bold text-success">
                  {stats?.bookings.confirmed ?? bookings.filter(b => b.status === 'confirmed').length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Cancelled</p>
                <p className="text-data text-2xl font-bold text-destructive">
                  {stats?.bookings.cancelled ?? bookings.filter(b => b.status === 'cancelled').length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-data text-2xl font-bold">{formatPrice(stats?.bookings.revenue ?? 0)}</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Bookings</CardTitle>
              <CardDescription>View all bookings across events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Search this page of bookings…"
                  aria-label="Search bookings on this page"
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              {filteredBookings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-lg mb-2">No bookings found</p>
                  <p className="text-muted-foreground">
                    Bookings will appear here when users make purchases
                  </p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[70vh] rounded-xl border">
                  <Table>
                    <TableCaption className="sr-only">Bookings</TableCaption>
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                      <TableRow>
                        <TableHead>Ticket No.</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map((booking) => (
                        <TableRow key={booking.id}>
                          <TableCell className="font-mono text-xs font-semibold" title={booking.id}>
                            {/* The first 8 hex digits are a timestamp, the same for a whole batch; the last 8 match the ticket's "No." */}
                            {booking.id.slice(-8).toUpperCase()}
                          </TableCell>
                          <TableCell>{booking.events?.title || "Unknown"}</TableCell>
                          <TableCell>
                            {booking.profiles?.first_name || "Unknown"}{" "}
                            {booking.profiles?.last_name || ""}
                          </TableCell>
                          <TableCell>{formatDate(booking.created_at)}</TableCell>
                          <TableCell>{(booking.events?.is_free || booking.is_free) ? <span className="text-success font-medium">Free</span> : formatPrice(booking.total_price)}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                booking.status === "confirmed"
                                  ? "bg-success/10 text-success"
                                  : booking.status === "cancelled"
                                  ? "bg-destructive/10 text-destructive"
                                  : booking.status === "refunded"
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-warning/10 text-warning"
                              }
                            >
                              {booking.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={booking.checked_in ? "default" : "outline"}
                              className={booking.checked_in ? "bg-success hover:bg-success/90 text-primary-foreground" : ""}
                              onClick={() => toggleCheckIn(booking.id, !!booking.checked_in)}
                              disabled={checkInLoading === booking.id || booking.status !== "confirmed"}
                            >
                              {checkInLoading === booking.id ? "…" : booking.checked_in ? "✓ In" : "Check In"}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <select
                              value={booking.status}
                              onChange={(e) => updateBookingStatus(booking.id, e.target.value)}
                              disabled={actionLoading === booking.id}
                              className="text-sm border rounded px-2 py-1 bg-background"
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="pending">Pending</option>
                              <option value="cancelled">Cancelled</option>
                              <option value="refunded">Refunded</option>
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Pager page={bookingsPage} total={bookingsTotalPages} onPage={(pg) => fetchBookings(pg)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-data text-2xl font-bold">{stats?.users.total ?? users.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-data text-2xl font-bold text-primary">
                  {stats?.users.admins ?? users.filter(u => u.is_admin).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">New This Month</p>
                <p className="text-data text-2xl font-bold">{stats?.users.newThisMonth ?? 0}</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>View and manage registered users</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportUsersCSV} disabled={exportUsersLoading}>
                    <Download className="h-4 w-4 mr-2" />
                    {exportUsersLoading ? "Exporting…" : "Export CSV"}
                  </Button>
                  <Button variant="outline" onClick={() => fetchUsers()}>
                    <Users className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Search this page of users…"
                  aria-label="Search users on this page"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-lg mb-2">No users found</p>
                  <p className="text-muted-foreground">
                    Users will appear here when they register
                  </p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[70vh] rounded-xl border">
                  <Table>
                    <TableCaption className="sr-only">Users</TableCaption>
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Course</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Bookings</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-xs" title={u.id}>…{u.id.slice(-8)}</TableCell>
                          <TableCell>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "N/A"}</TableCell>
                          <TableCell className="text-sm">{u.email || "—"}</TableCell>
                          <TableCell className="text-sm font-mono">{u.student_id || "—"}</TableCell>
                          <TableCell className="text-sm">{u.course || "—"}</TableCell>
                          <TableCell className="text-sm">{u.phone_number || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{u.booking_count ?? 0}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(u.created_at)}</TableCell>
                          <TableCell>
                            {u.is_admin ? (
                              <Badge className="bg-accent text-accent-foreground">Admin</Badge>
                            ) : (
                              <Badge variant="outline">User</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setBanContext({ userId: u.id, userEmail: u.email }); setShowBanDialog(true); }}
                                aria-label={`Ban from Event: ${u.email}`}
                                disabled={!!actionLoading}
                              >
                                Event bans
                              </Button>
                              <Button
                                size="sm"
                                variant={u.is_admin ? "destructive" : "outline"}
                                onClick={() => toggleAdminRole(u.id, !u.is_admin)}
                                aria-label={`${u.is_admin ? "Remove Admin" : "Make Admin"}: ${u.email}`}
                                disabled={u.id === user?.id || actionLoading === u.id}
                              >
                                {actionLoading === u.id ? "Saving…" : u.is_admin ? "Remove Admin" : "Make Admin"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setSelectedUser(u); setShowUserDialog(true); }}
                                aria-label={`View ${u.email}`}
                              >
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Pager page={usersPage} total={usersTotalPages} onPage={(pg) => fetchUsers(pg)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Event Form Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <form onSubmit={handleEventSubmit}>
            <DialogHeader>
              <DialogTitle>
                {currentEventId ? "Edit Event" : "Create New Event"}
              </DialogTitle>
              <DialogDescription>
                {currentEventId
                  ? "Make changes to the event details"
                  : "Fill in the details for the new event"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="title">Event Title</Label>
                  <Input
                    id="title"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Enter event title"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="description">Description</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateAIDescription}
                      disabled={isGeneratingDesc || descCooldown > 0 || !eventTitle || !eventCategory}
                      className="h-7 text-xs gap-1"
                    >
                      {isGeneratingDesc
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                        : descCooldown > 0
                          ? <>Wait {descCooldown}s</>
                          : <><Sparkles className="h-3 w-3" /> Generate AI Description</>}
                    </Button>
                  </div>
                  <Textarea
                    id="description"
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    placeholder="Enter event description or click Generate AI Description above"
                    className="min-h-32"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="time">Time</Label>
                    <Input
                      id="time"
                      type="time"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="Enter event location"
                    required
                  />
                </div>

                <div className="flex items-center space-x-2 mb-3">
                  <Switch
                    id="isFreeEvent"
                    checked={isFreeEvent}
                    onCheckedChange={setIsFreeEvent}
                  />
                  <Label htmlFor="isFreeEvent">Free Event</Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    {creatingCategory || existingCategories.length === 0 ? (
                      <div className="flex gap-2">
                        <Input
                          id="category"
                          value={eventCategory}
                          onChange={(e) => setEventCategory(e.target.value)}
                          placeholder="New category name"
                          required
                        />
                        {existingCategories.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setCreatingCategory(false);
                              setEventCategory("");
                            }}
                          >
                            Pick
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Select
                        value={eventCategory}
                        onValueChange={(value) => {
                          if (value === NEW_CATEGORY) {
                            setCreatingCategory(true);
                            setEventCategory("");
                            return;
                          }
                          setEventCategory(value);
                        }}
                      >
                        <SelectTrigger id="category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {existingCategories.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                          <SelectItem value={NEW_CATEGORY}>+ Create new category…</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      A new category appears in the site's “Browse by” bar once a
                      published event uses it.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="price">Price (₹) {isFreeEvent && "(Free)"}</Label>
                    <Input
                      id="price"
                      type="number"
                      value={isFreeEvent ? "0" : eventPrice}
                      onChange={(e) => setEventPrice(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      disabled={isFreeEvent}
                      required={!isFreeEvent}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="maxSeatsPerUser">Maximum seats per user</Label>
                  <Input
                    id="maxSeatsPerUser"
                    type="number"
                    value={maxSeatsPerUser}
                    onChange={(e) => setMaxSeatsPerUser(parseInt(e.target.value) || 1)}
                    min="1"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="imageUrl">Image URL (optional)</Label>
                  <Input
                    id="imageUrl"
                    value={eventImageUrl}
                    onChange={(e) => setEventImageUrl(e.target.value)}
                    placeholder="Enter image URL"
                  />
                </div>

                {/* ── What this event's tickets print ── */}
                <fieldset className="rounded-2xl border border-border p-4">
                  <legend className="px-1 font-display text-xl font-extrabold uppercase">Ticket</legend>
                  <p className="mb-4 text-xs text-muted-foreground">
                    What attendees' tickets show for this event. Changes apply to tickets already booked too.
                  </p>
                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor="tsIssuer">Issued by</Label>
                      <Input
                        id="tsIssuer"
                        value={ticketSettings.issuer ?? ""}
                        onChange={(e) => setTicket("issuer", e.target.value)}
                        placeholder="e.g. Invertis University (leave empty for none)"
                        maxLength={80}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-3 py-2.5">
                      <Label htmlFor="tsHolder" className="font-normal">Print the attendee's name</Label>
                      <Switch id="tsHolder" checked={ticketSettings.show_holder} onCheckedChange={(v) => setTicket("show_holder", v)} />
                    </div>
                    {(
                      [
                        ["show_student_id", "student_id_label", "tsStudentId", "Ask for a student ID"],
                        ["show_course", "course_label", "tsCourse", "Ask for a course"],
                      ] as const
                    ).map(([flag, labelKey, id, text]) => (
                      <div key={id} className="grid gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-4">
                          <Label htmlFor={id} className="font-normal">{text}</Label>
                          <Switch id={id} checked={ticketSettings[flag]} onCheckedChange={(v) => setTicket(flag, v)} />
                        </div>
                        {ticketSettings[flag] && (
                          <div className="flex items-center gap-3">
                            <Label htmlFor={`${id}Label`} className="shrink-0 text-xs text-muted-foreground">
                              Shown as
                            </Label>
                            <Input
                              id={`${id}Label`}
                              value={ticketSettings[labelKey]}
                              onChange={(e) => setTicket(labelKey, e.target.value)}
                              maxLength={40}
                              className="h-9"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    <div>
                      <Label htmlFor="tsNote">Note on the ticket (optional)</Label>
                      <Input
                        id="tsNote"
                        value={ticketSettings.note ?? ""}
                        onChange={(e) => setTicket("note", e.target.value)}
                        placeholder="e.g. Entry from Gate 3 · Doors open 6:30 PM"
                        maxLength={160}
                      />
                    </div>
                    {/* Live preview: the real ticket face, scaled down, with sample attendee details. */}
                    <div aria-hidden="true" className="overflow-x-auto rounded-xl bg-muted/50 p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
                      <div style={{ width: 760, zoom: 0.72 }}>
                        <div className="tk-scene">
                          <TicketFront
                            qr=""
                            t={{
                              bookingId: "preview",
                              ref: "PREVIEW1",
                              status: "confirmed",
                              checkedIn: false,
                              title: eventTitle || "Your event",
                              category: eventCategory,
                              date: eventDate ? fromLocalDateTimeParts(eventDate, eventTime).toISOString() : "",
                              time: eventTime
                                ? new Date(`2000-01-01T${eventTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                                : "",
                              venue: eventLocation,
                              imageUrl: null,
                              isFree: isFreeEvent,
                              total: isFreeEvent ? 0 : parseFloat(eventPrice) || 0,
                              seats: [{ row: "C", number: 7, type: "standard" }],
                              bookedAt: "",
                              holder: ticketSettings.show_holder ? "Asha Verma" : "",
                              studentId: ticketSettings.show_student_id ? "BCS2022171" : "",
                              course: ticketSettings.show_course ? "B.Tech CSE" : "",
                              issuer: ticketSettings.issuer?.trim() ?? "",
                              studentIdLabel: ticketSettings.student_id_label || "Student ID",
                              courseLabel: ticketSettings.course_label || "Course",
                              note: ticketSettings.note?.trim() ?? "",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="publishEvent"
                    checked={publishEvent}
                    onCheckedChange={setPublishEvent}
                  />
                  <Label htmlFor="publishEvent">Publish event</Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEventDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEvent}>
                {savingEvent ? "Saving…" : "Save event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Seat Management Dialog */}
      <Dialog open={showSeatDialog} onOpenChange={setShowSeatDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Seats</DialogTitle>
            <DialogDescription>
              Generate seats for event: {selectedEventTitle}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {existingSeatCount > 0 ? (
              <>
                <span className="font-medium">Current layout:</span>{" "}
                {existingSeatCount} seats — {numberOfRows} rows × {numberOfColumns} per row
                {existingSoldCount > 0 && (
                  <span className="text-muted-foreground"> · {existingSoldCount} booked</span>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generating replaces this layout and cancels every booking on it.
                </p>
              </>
            ) : (
              <span className="text-muted-foreground">
                No seats generated for this event yet.
              </span>
            )}
          </div>

          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2 mb-3">
              <Switch
                id="customLayout"
                checked={customLayout}
                onCheckedChange={setCustomLayout}
              />
              <Label htmlFor="customLayout">Use theater-style seat layout</Label>
            </div>

            {customLayout ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="numberOfRows">Number of rows</Label>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setNumberOfRows(Math.max(3, numberOfRows - 1))}
                          aria-label="Decrease number of rows"
                          className="p-1.5 min-h-8 min-w-8 rounded-md bg-surface-elevated hover:bg-muted"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <Input
                          id="numberOfRows"
                          type="number"
                          value={numberOfRows}
                          onChange={(e) => setNumberOfRows(parseInt(e.target.value) || 3)}
                          min="3"
                          className="w-16 mx-1 text-center"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setNumberOfRows(numberOfRows + 1)}
                          aria-label="Increase number of rows"
                          className="p-1.5 min-h-8 min-w-8 rounded-md bg-surface-elevated hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="numberOfColumns">Seats per row</Label>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setNumberOfColumns(Math.max(5, numberOfColumns - 1))}
                          className="p-1.5 min-h-8 min-w-8 rounded-md bg-surface-elevated hover:bg-muted"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <Input
                          id="numberOfColumns"
                          type="number"
                          value={numberOfColumns}
                          onChange={(e) => setNumberOfColumns(parseInt(e.target.value) || 5)}
                          min="5"
                          className="w-16 mx-1 text-center"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setNumberOfColumns(numberOfColumns + 1)}
                          className="p-1.5 min-h-8 min-w-8 rounded-md bg-surface-elevated hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="seatPrice">Base price per seat (₹)</Label>
                  <div className="text-xs text-muted-foreground mb-1">
                    Front section: Base price + ₹5, Back section: Base price + ₹2, Balcony: Base price
                  </div>
                  <Input
                    id="seatPrice"
                    type="number"
                    value={seatPrice}
                    onChange={(e) => setSeatPrice(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label htmlFor="previewVisible-1" className="text-sm font-medium">Layout Preview</Label>
                  <Switch
                    id="previewVisible-1"
                    checked={previewVisible}
                    onCheckedChange={setPreviewVisible}
                  />
                </div>

                {renderSeatPreview()}

                <div className="text-center p-2 bg-surface-secondary rounded-md">
                  <p className="text-lg font-medium mb-1">Total Seats</p>
                  <p className="mb-1 text-2xl font-bold">
                    {numberOfRows * numberOfColumns}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This will create {numberOfRows} rows × {numberOfColumns} columns = {numberOfRows * numberOfColumns} seats
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="rowLetters">Row letters (comma-separated)</Label>
                  <Input
                    id="rowLetters"
                    value={rows.join(",")}
                    onChange={(e) => setRows(e.target.value.split(",").map(r => r.trim()))}
                    placeholder="A,B,C"
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="seatsPerRow">Seats per row</Label>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setSeatsPerRow(Math.max(5, seatsPerRow - 1))}
                      aria-label="Decrease seats per row"
                          className="p-1.5 min-h-8 min-w-8 rounded-md bg-surface-elevated hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <Input
                      id="seatsPerRow"
                      type="number"
                      value={seatsPerRow}
                      onChange={(e) => setSeatsPerRow(parseInt(e.target.value) || 5)}
                      min="5"
                      className="w-16 mx-1 text-center"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setSeatsPerRow(seatsPerRow + 1)}
                      aria-label="Increase seats per row"
                          className="p-1.5 min-h-8 min-w-8 rounded-md bg-surface-elevated hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="seatPrice">Price per seat (₹)</Label>
                  <Input
                    id="seatPrice"
                    type="number"
                    value={seatPrice}
                    onChange={(e) => setSeatPrice(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <Separator />
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="previewVisible-2" className="text-sm font-medium">Layout Preview</Label>
                  <Switch
                    id="previewVisible-2"
                    checked={previewVisible}
                    onCheckedChange={setPreviewVisible}
                  />
                </div>

                {renderSeatPreview()}
                
                <div className="text-center p-2 bg-surface-secondary rounded-md">
                  <p className="text-lg font-medium mb-1">Total Seats</p>
                  <p className="mb-1 text-2xl font-bold">
                    {rows.length * seatsPerRow}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This will create {rows.length} rows × {seatsPerRow} seats = {rows.length * seatsPerRow} seats
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSeatDialog(false)}
              disabled={generatingSeats}
            >
              Cancel
            </Button>
            <Button onClick={handleSeatGeneration} disabled={generatingSeats}>
              {generatingSeats ? "Generating…" : "Generate Seats"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Details Dialog */}
      <Dialog open={showBookingDetailsDialog} onOpenChange={setShowBookingDetailsDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bookings for {eventBookingsTitle}</DialogTitle>
            <DialogDescription>
              All bookings for this event
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {selectedEventBookings.length === 0 ? (
              <div className="text-center py-8">
                <p>No bookings found for this event.</p>
              </div>
            ) : (
              <Table>
                <TableCaption className="sr-only">Bookings for this event</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedEventBookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">
                        {booking.id.substring(0, 8)}
                      </TableCell>
                      <TableCell>
                        {booking.profiles?.first_name || "Unknown"}{" "}
                        {booking.profiles?.last_name || ""}
                      </TableCell>
                      <TableCell>{booking.profiles?.email || "Unknown"}</TableCell>
                      <TableCell>{formatDate(booking.created_at)}</TableCell>
                      <TableCell>{(booking.events?.is_free || booking.is_free) ? <span className="text-success font-medium">Free</span> : formatPrice(booking.total_price)}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            booking.status === "confirmed"
                              ? "bg-success/10 text-success"
                              : booking.status === "cancelled"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning"
                          }
                        >
                          {booking.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowBookingDetailsDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Analytics Dialog */}
      <Dialog open={showAnalyticsDialog} onOpenChange={setShowAnalyticsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Analytics — {analyticsTitle}</DialogTitle>
            <DialogDescription>Detailed statistics for this event</DialogDescription>
          </DialogHeader>
          {analyticsLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading analytics…</div>
          ) : analyticsData ? (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Seats",    value: analyticsData.total_seats },
                  { label: "Available",      value: analyticsData.available_seats },
                  { label: "Booked",         value: analyticsData.booked_seats },
                  { label: "Occupancy",      value: `${analyticsData.occupancy_pct}%` },
                  { label: "VIP Seats",      value: analyticsData.vip_seats },
                  { label: "Wheelchair",     value: analyticsData.wheelchair_seats ?? 0 },
                  { label: "Blocked",        value: analyticsData.blocked_seats },
                  { label: "Checked In",     value: analyticsData.checked_in },
                  { label: "Revenue",        value: formatPrice(analyticsData.revenue ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                ))}
              </div>

              {/* Booking breakdown */}
              <div>
                <p className="text-sm font-semibold mb-2">Booking Breakdown</p>
                <div className="space-y-2">
                  {[
                    { label: "Confirmed", count: analyticsData.confirmed_bookings, color: "bg-success" },
                    { label: "Cancelled", count: analyticsData.cancelled_bookings, color: "bg-destructive" },
                  ].map(({ label, count, color }) => {
                    const pct = analyticsData.total_bookings > 0 ? Math.round((count / analyticsData.total_bookings) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{label}</span>
                          <span className="font-medium">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Booking trend (last 14 days) */}
              {analyticsData.booking_trend?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Booking Trend (Last 14 Days)</p>
                  <div className="flex items-end gap-1 h-20">
                    {analyticsData.booking_trend.map((d: { date: string; count: number }) => {
                      const maxCount = Math.max(...analyticsData.booking_trend.map((x: any) => x.count), 1);
                      const height = Math.round((d.count / maxCount) * 100);
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-primary rounded-sm transition-all"
                            style={{ height: `${height}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                            title={`${d.date}: ${d.count} booking(s)`}
                          />
                          <span className="text-[9px] text-muted-foreground rotate-45 origin-left">{d.date}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Most active users */}
              {analyticsData.most_active_users?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Most Active Attendees</p>
                  <Table>
                    <TableCaption className="sr-only">Event analytics</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Bookings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsData.most_active_users.map((u: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{u.name}</TableCell>
                          <TableCell className="font-mono text-xs">{u.student_id || "—"}</TableCell>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell><Badge variant="outline">{u.bookings}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seat Control Dialog */}
      <Dialog open={showSeatControlDialog} onOpenChange={setShowSeatControlDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Seat Control — {seatCtrlEventTitle}</DialogTitle>
            <DialogDescription>
              Click seats to select. Use the action panel to book, mark VIP/Blocked, or reset.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Seat grid */}
            <div className="md:col-span-2 max-h-[50vh] overflow-y-auto">
              {seatCtrlLoading ? (
                <p className="text-center text-muted-foreground py-8">Loading seats…</p>
              ) : seatCtrlSeats.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No seats found. Generate seats first.</p>
              ) : (
                <div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    {[
                      { label: "Available", cls: "bg-success/10 border-success/40 text-success" },
                      { label: "Booked",    cls: "bg-destructive/10 border-destructive/40 text-destructive" },
                      { label: "Reserved",  cls: "bg-warning/10 border-warning/40 text-warning" },
                      { label: "VIP",       cls: "bg-accent border-primary/40 text-accent-foreground" },
                      { label: "Blocked",   cls: "bg-muted border-border text-muted-foreground" },
                      { label: "Selected",  cls: "bg-primary border-primary text-primary-foreground" },
                    ].map(({ label, cls }) => (
                      <span key={label} className={`border rounded px-2 py-0.5 font-medium ${cls}`}>{label}</span>
                    ))}
                  </div>
                  {/* Seat buttons grouped by row */}
                  {(() => {
                    const rows: Record<string, any[]> = {};
                    seatCtrlSeats.forEach((s) => { rows[s.row] = [...(rows[s.row] || []), s]; });
                    return Object.entries(rows).sort(([a], [b]) => compareRows(a, b)).map(([row, seats]) => (
                      <div key={row} className="flex items-center gap-1 mb-1">
                        <span className="text-xs font-bold w-4 shrink-0">{row}</span>
                        <div className="flex flex-wrap gap-1">
                          {seats.sort((a, b) => a.number - b.number).map((s) => {
                            const isSelected = seatCtrlSelected.includes(s._id ?? s.id);
                            let cls = "bg-success/10 border-success/40 text-success";
                            if (isSelected) cls = "bg-primary border-primary text-primary-foreground";
                            else if (s.status === "booked") cls = "bg-destructive/10 border-destructive/40 text-destructive";
                            else if (s.seat_type === "vip") cls = "bg-accent border-primary/40 text-accent-foreground";
                            else if (s.seat_type === "wheelchair") cls = "bg-seat-standard/15 border-seat-standard/50 text-foreground";
                            else if (s.seat_type === "blocked") cls = "bg-muted border-border text-muted-foreground";
                            else if (s.status === "reserved") cls = "bg-warning/10 border-warning/40 text-warning";
                            return (
                              <button
                                key={s._id ?? s.id}
                                onMouseDown={() => handleSeatMouseDown(s._id ?? s.id)}
                                onMouseEnter={() => handleSeatMouseEnter(s._id ?? s.id)}
                                className={`border rounded text-xs px-1.5 py-0.5 font-medium transition-colors ${cls}`}
                                title={`${s.row}${s.number} — ${s.seat_type} / ${s.status}`}
                              >
                                {s.seat_type === "wheelchair" ? <span aria-hidden="true">♿</span> : null}
                                {s.number}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Action panel */}
            <div className="space-y-3 border rounded-lg p-3">
              <p className="text-sm font-semibold">
                {seatCtrlSelected.length} seat{seatCtrlSelected.length !== 1 ? "s" : ""} selected
              </p>

              <div>
                <label className="block text-xs font-medium mb-1">Action</label>
                <select
                  value={seatCtrlAction}
                  onChange={(e) => setSeatCtrlAction(e.target.value as any)}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                >
                  <option value="book">Book for User</option>
                  <option value="vip">Mark as VIP</option>
                  <option value="wheelchair">Mark as Wheelchair space</option>
                  <option value="blocked">Mark as Blocked</option>
                  <option value="available">Reset to Available</option>
                </select>
              </div>

              {seatCtrlAction === "book" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1">User Email (leave blank = admin)</label>
                    <Input
                      value={seatCtrlUserEmail}
                      onChange={(e) => setSeatCtrlUserEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Note (optional)</label>
                    <Input
                      value={seatCtrlNote}
                      onChange={(e) => setSeatCtrlNote(e.target.value)}
                      placeholder="VIP guest, speaker, etc."
                      className="text-sm"
                    />
                  </div>
                </>
              )}

              <Button
                className="w-full"
                onClick={executeSeatCtrlAction}
                disabled={!seatCtrlSelected.length || seatCtrlLoading}
              >
                {seatCtrlLoading ? "Processing…" : "Execute Action"}
              </Button>

              {seatCtrlSelected.length > 0 && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSeatCtrlSelected([])}>
                  Clear Selection
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeatControlDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban User Dialog */}
      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User from Event</DialogTitle>
            <DialogDescription>
              {banContext.userEmail ? `Ban ${banContext.userEmail} from an event` : 'Select an event to ban this user'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="event-select">Select Event</Label>
              <select
                id="event-select"
                className="w-full border rounded px-3 py-2 mt-1 bg-background"
                value={banContext.eventId || ""}
                onChange={(e) => setBanContext({ ...banContext, eventId: e.target.value, eventTitle: events.find((ev) => ev.id === e.target.value)?.title })}
              >
                <option value="">-- Select an event --</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
            </div>
            {banContext.eventId && (
              <div className="text-sm text-muted-foreground">
                This will ban the user from: <span className="font-medium">{banContext.eventTitle}</span>
              </div>
            )}
            {(() => {
              // Bans used to be one-way: nothing listed them, so a mistaken ban was permanent.
              const bannedFrom = events.filter((ev) => (ev.banned_users ?? []).map(String).includes(String(banContext.userId)));
              if (bannedFrom.length === 0) return null;
              return (
                <div className="rounded-xl border border-border p-3">
                  <p className="mb-2 text-sm font-medium">Already banned from</p>
                  <ul className="space-y-2">
                    {bannedFrom.map((ev) => (
                      <li key={ev.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{ev.title}</span>
                        <Button size="sm" variant="outline" onClick={() => unbanUserFromEvent(ev.id, String(banContext.userId))}>
                          Unban
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBanDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!banContext.eventId || !banContext.userId) return;
                await banUserFromEvent(banContext.eventId, banContext.userId);
                setShowBanDialog(false);
              }}
              disabled={!banContext.eventId || !banContext.userId}
            >
              Ban User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared confirmation for destructive actions */}
      <AlertDialog
        open={!!confirmRequest}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) setConfirmRequest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{shownConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{shownConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirmBusy}
              onClick={async (e) => {
                e.preventDefault(); // stay open (and busy) until the action finishes
                if (!confirmRequest) return;
                setConfirmBusy(true);
                try {
                  await confirmRequest.run();
                } catch (err: any) {
                  toast({ title: "Error", description: err?.message || "Something went wrong", variant: "destructive" });
                } finally {
                  setConfirmBusy(false);
                  setConfirmRequest(null);
                }
              }}
            >
              {confirmBusy ? "Working…" : shownConfirm?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Detail Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <p>{selectedUser.first_name} {selectedUser.last_name}</p>
              </div>
              <div>
                <Label>Email</Label>
                <p>{selectedUser.email}</p>
              </div>
              <div>
                <Label>Student ID</Label>
                <p>{selectedUser.student_id || "N/A"}</p>
              </div>
              <div>
                <Label>Phone</Label>
                <p>{selectedUser.phone_number || "N/A"}</p>
              </div>
              <div>
                <Label>Registered</Label>
                <p>{formatDate(selectedUser.created_at)}</p>
              </div>
              <div>
                <Label>Role</Label>
                <Badge className={selectedUser.is_admin ? "bg-accent text-accent-foreground" : ""}>
                  {selectedUser.is_admin ? "Admin" : "User"}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowUserDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
