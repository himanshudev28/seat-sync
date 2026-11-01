/**
 * Original seat grid vs today's SeatSelection on the SAME server payload. Today's file draws the same old grid
 * (Front / Back / Balcony, split rows) on top of the fixed booking logic; this checks the logic held.
 * "Old" = components/legacy/SeatSelectionLegacy (the original file, post data-fetching fixes).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeatSelection from "./SeatSelection";
import SeatSelectionLegacy from "./legacy/SeatSelectionLegacy";

// One stable object, like the real AuthProvider: a new `user` each render would re-run the mount effect forever.
const AUTH = { user: { id: "u1" }, profile: null };
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => AUTH }));
const toastSpy = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toastSpy(...a) }));

const EVENT = "ev1";
// Server payload: 3 rows of 8, row prices 500 / 300 / 300, mixed statuses, one blocked and one VIP seat.
type RawSeat = { _id: string; row: string; number: number; price: number; status: string; seat_type: string; label: null };
function payload(): RawSeat[] {
  const out: RawSeat[] = [];
  for (const [row, price] of [["A", 500], ["B", 300], ["C", 300]] as const) {
    for (let n = 1; n <= 8; n++) {
      const id = `${row}${n}`;
      const status = id === "A1" || id === "B5" ? "booked" : id === "A8" ? "reserved" : "available";
      const seat_type = id === "C8" ? "blocked" : id === "A4" ? "vip" : "standard";
      out.push({ _id: id, row, number: n, price, status, seat_type, label: null });
    }
  }
  return out;
}
const SEATS = payload();

type Call = { url: string; body: unknown };
let calls: Call[];
let holdStatus: number;
let holdBody: Record<string, unknown>;
let releaseDelayMs = 0;
let seatOverrides: Record<string, Partial<RawSeat> & { held_by_me?: boolean }> = {};

function mockServer() {
  calls = [];
  holdStatus = 200;
  holdBody = { success: true };
  releaseDelayMs = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (init?.method === "POST") calls.push({ url, body });
      const json = (status: number, data: unknown) =>
        new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
      if (url.startsWith("/api/seats?eventId=")) return json(200, SEATS.map((x) => ({ ...x, ...seatOverrides[x._id] })));
      if (url.startsWith("/api/bookings?userId=")) return json(200, []);
      if (url === "/api/seats/hold") return json(holdStatus, holdBody);
      if (url === "/api/seats/release") {
        if (releaseDelayMs) await new Promise((res) => setTimeout(res, releaseDelayMs));
        return json(200, { success: true });
      }
      return json(404, {});
    }),
  );
}

const sum = (ids: string[]) => ids.reduce((t, id) => t + (SEATS.find((s) => s._id === id)?.price ?? 0), 0);

/** Click helpers per implementation. */
const oldSeat = (id: string) => screen.getByRole("button", { name: `Seat ${id}` });
const newSeat = (id: string) => {
  const el = document.querySelector<HTMLButtonElement>(`[data-seat="${id}"]`);
  if (!el) throw new Error(`no seat ${id}`);
  return el;
};

/** Both pickers fetch the seat map more than once on mount; wait until every load has settled. */
async function settled(ready: () => unknown) {
  await waitFor(
    () => {
      expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
      expect(ready()).toBeTruthy();
    },
    { timeout: 3000 },
  );
  await act(() => new Promise((res) => setTimeout(res, 30)));
  await waitFor(() => expect(document.querySelector('[role="status"][aria-busy="true"]')).toBeNull());
}
async function renderOld() {
  const onSelect = vi.fn();
  const r = render(<SeatSelectionLegacy eventId={EVENT} onSeatSelect={onSelect} />);
  await settled(() => screen.queryByRole("button", { name: "Seat A2" }));
  return { onSelect, ...r };
}
async function renderNew(maxSelectable?: number) {
  const onSelect = vi.fn();
  const r = render(<SeatSelection eventId={EVENT} onSeatSelect={onSelect} maxSelectable={maxSelectable} />);
  await settled(() => document.querySelector('[data-seat="A2"]'));
  return { onSelect, ...r };
}

beforeEach(() => {
  seatOverrides = {};
  mockServer();
  toastSpy.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SeatSelection (old grid, fixed logic) vs the original, same server payload", () => {
  it("renders exactly the server's seats (same ids) in both", async () => {
    const ids = SEATS.map((s) => s._id).sort();
    const oldR = await renderOld();
    const oldIds = screen.getAllByRole("button", { name: /^Seat [A-C]\d+$/ }).map((b) => b.getAttribute("aria-label")!.slice(5)).sort();
    oldR.unmount();
    await renderNew();
    const newIds = Array.from(document.querySelectorAll("[data-seat]")).map((b) => b.getAttribute("data-seat")!).sort();
    expect(oldIds).toEqual(ids);
    expect(newIds).toEqual(ids);
  });

  it("same unavailable seats (booked / on hold); blocked is now unavailable too (the old grid let you click it)", async () => {
    const oldR = await renderOld();
    const oldDisabled = SEATS.filter((s) => (oldSeat(s._id) as HTMLButtonElement).disabled).map((s) => s._id).sort();
    const oldBlockedClickable = !(oldSeat("C8") as HTMLButtonElement).disabled;
    oldR.unmount();
    await renderNew();
    const newDisabled = SEATS.filter((s) => newSeat(s._id).getAttribute("aria-disabled") === "true").map((s) => s._id).sort();
    expect(oldDisabled).toEqual(["A1", "A8", "B5"]);
    expect(oldBlockedClickable).toBe(true); // the old bug: the server would answer 409
    expect(newDisabled).toEqual(["A1", "A8", "B5", "C8"]);
  });

  it("selecting and deselecting: same hold/release requests and the same ids + total reported", async () => {
    const run = async (impl: "old" | "new") => {
      mockServer();
      const r = impl === "old" ? await renderOld() : await renderNew();
      const click = impl === "old" ? oldSeat : newSeat;
      fireEvent.click(click("A2"));
      await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["A2"], 500));
      // let the 100 ms throttle of the old grid pass
      await act(() => new Promise((res) => setTimeout(res, 120)));
      fireEvent.click(click("B3"));
      await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["A2", "B3"], 800));
      await act(() => new Promise((res) => setTimeout(res, 120)));
      fireEvent.click(click("A2"));
      await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["B3"], 300));
      const out = { calls: [...calls], last: r.onSelect.mock.calls.at(-1) };
      r.unmount();
      return out;
    };
    const oldRun = await run("old");
    const newRun = await run("new");
    const posts = (c: Call[]) => c.filter((x) => x.url !== "/api/seats/release" || (x.body as { seatIds: string[] }).seatIds.length);
    expect(posts(newRun.calls).slice(0, 3)).toEqual(posts(oldRun.calls).slice(0, 3));
    expect(posts(newRun.calls).slice(0, 3)).toEqual([
      { url: "/api/seats/hold", body: { eventId: EVENT, seatIds: ["A2"] } },
      { url: "/api/seats/hold", body: { eventId: EVENT, seatIds: ["B3"] } },
      { url: "/api/seats/release", body: { seatIds: ["A2"] } },
    ]);
    expect(newRun.last).toEqual(oldRun.last);
  });

  it("booked, on-hold and blocked seats never trigger a hold in v2", async () => {
    await renderNew();
    for (const id of ["A1", "A8", "B5", "C8"]) fireEvent.click(newSeat(id));
    await act(() => new Promise((res) => setTimeout(res, 50)));
    expect(calls.filter((c) => c.url === "/api/seats/hold")).toEqual([]);
  });

  it("same layout as the original: Front / Back / Balcony with the same rows, and the same split rows", async () => {
    const oldR = await renderOld();
    // Original: row A is one block of 8; rows B and C are two halves.
    const oldShape = [oldSeat("A2").parentElement!.childElementCount, oldSeat("B2").parentElement!.parentElement!.childElementCount, oldSeat("C2").parentElement!.parentElement!.childElementCount];
    oldR.unmount();
    await renderNew();
    for (const name of ["Front", "Back", "Balcony"]) expect(screen.getByText(name)).toBeInTheDocument();
    // Row A (front) is one block; rows B, C (back, balcony) are split into two halves of 4, as before.
    expect(within(screen.getByRole("group", { name: "Row A" })).getAllByRole("button")).toHaveLength(8);
    expect(oldShape).toEqual([8, 2, 2]);
    const halves = (row: string) => screen.getByRole("group", { name: `Row ${row}` }).querySelectorAll(":scope > div > div").length;
    expect([halves("A"), halves("B"), halves("C")]).toEqual([1, 2, 2]);
  });

  it("limit reached (maxSelectable): says so without asking the server for another hold", async () => {
    const r = await renderNew(1);
    fireEvent.click(newSeat("C2"));
    await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["C2"], 300));
    fireEvent.click(newSeat("C3"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Seat limit reached" })));
    expect(calls.filter((c) => c.url === "/api/seats/hold")).toHaveLength(1);
  });

  it("summary line names the seats and the total; selected seats are aria-pressed", async () => {
    const r = await renderNew();
    fireEvent.click(newSeat("A2"));
    await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["A2"], 500));
    fireEvent.click(newSeat("B3"));
    await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["A2", "B3"], 800));
    const summary = screen.getAllByRole("status").find((el) => /seats/.test(el.textContent ?? ""))!;
    expect(summary.textContent).toMatch(/2\s*seats.*A2, B3.*₹800/);
    expect(newSeat("A2").getAttribute("aria-pressed")).toBe("true");
    expect(newSeat("A3").getAttribute("aria-pressed")).toBe("false");
  });

  it("one tab stop for the grid; arrow keys move between seats and rows", async () => {
    await renderNew();
    const stops = document.querySelectorAll('[data-seat][tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute("data-seat")).toBe("A2"); // first available seat (A1 is booked)
    const a2 = newSeat("A2");
    a2.focus();
    fireEvent.keyDown(a2, { key: "ArrowRight" });
    expect(document.activeElement).toBe(newSeat("A3"));
    fireEvent.keyDown(newSeat("A3"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(newSeat("B3"));
    expect(newSeat("B3").tabIndex).toBe(0);
    expect(newSeat("A2").tabIndex).toBe(-1);
    // Booked seats can be reached and read, but not picked.
    fireEvent.keyDown(newSeat("B3"), { key: "ArrowRight" });
    fireEvent.keyDown(newSeat("B4"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(newSeat("B5"));
    expect(newSeat("B5").getAttribute("aria-label")).toMatch(/booked/);
  });

  it("hold cap (409 'at most N seats'): says so and leaves the seat available", async () => {
    await renderNew();
    holdStatus = 409;
    holdBody = { error: "You can hold at most 2 seats for this event" };
    fireEvent.click(newSeat("C2"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Seat limit reached" })));
    expect(newSeat("C2").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("seat taken (409 other): seat turns unavailable, like the old grid", async () => {
    await renderNew();
    holdStatus = 409;
    holdBody = { error: "One or more seats are no longer available" };
    fireEvent.click(newSeat("C3"));
    await waitFor(() => expect(newSeat("C3").getAttribute("aria-disabled")).toBe("true"));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Seat just taken" }));
  });

  it("each seat's name says row, number, the server's price and its status", async () => {
    await renderNew();
    expect(screen.getByRole("button", { name: /^Row A, seat 2, ₹500(\.00)?, available$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Row C, seat 2, ₹300(\.00)?, available$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Row A, seat 1, .*, booked$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Row A, seat 8, .*, on hold$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Row C, seat 8, .*, unavailable$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Row A, seat 4, .*, available, VIP$/ })).toBeInTheDocument();
  });

  it("reports the cheapest pickable seat price for 'Tickets from' (blocked seats left out)", async () => {
    seatOverrides = { C1: { price: 100, seat_type: "blocked" } };
    mockServer();
    const onMinPrice = vi.fn();
    render(<SeatSelection eventId={EVENT} onSeatSelect={vi.fn()} onMinPrice={onMinPrice} />);
    await settled(() => document.querySelector('[data-seat="A2"]'));
    expect(onMinPrice).toHaveBeenLastCalledWith(300);
  });

  it("re-clicking a seat while its release is still in flight re-selects it (queued, not dropped)", async () => {
    const r = await renderNew();
    fireEvent.click(newSeat("C2"));
    await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["C2"], 300));
    releaseDelayMs = 300;
    fireEvent.click(newSeat("C2")); // deselect → slow release
    await act(() => new Promise((res) => setTimeout(res, 50)));
    fireEvent.click(newSeat("C2")); // re-select while the release is in flight
    await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["C2"], 300), { timeout: 2000 });
    const order = calls.map((c) => c.url);
    expect(order.filter((u) => u !== "/api/bookings")).toEqual(["/api/seats/hold", "/api/seats/release", "/api/seats/hold"]);
  });

  it("a seat the server says I hold (held_by_me) is pickable, not 'on hold by someone else'", async () => {
    seatOverrides = { C4: { status: "reserved", held_by_me: true } };
    mockServer();
    const r = await renderNew();
    expect(newSeat("C4").getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(newSeat("C4"));
    await waitFor(() => expect(r.onSelect).toHaveBeenLastCalledWith(["C4"], 300));
    expect(calls).toContainEqual({ url: "/api/seats/hold", body: { eventId: EVENT, seatIds: ["C4"] } });
  });
});
