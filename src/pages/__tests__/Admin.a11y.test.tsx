import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Signed-in admin; the route guard is tested elsewhere, the page itself only reads `user`.
// One stable object: the page's effects depend on `user`, so a fresh object per render would refetch forever.
vi.mock("@/providers/AuthProvider", () => {
  const auth = {
    user: { id: "u1", email: "admin@example.com" },
    profile: { id: "u1", email: "admin@example.com", is_admin: true },
    isLoading: false,
  };
  return { useAuth: () => auth };
});

import Admin from "../Admin";

const sampleEvent = {
  id: "e1",
  _id: "e1",
  title: "Past Gala",
  date: "2025-01-10T19:00:00.000Z",
  category: "Concert",
  price: 500,
  is_free: false,
  is_published: true,
  is_bookings_open: true,
  total_seats: 240,
  sold_seats: 12,
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

// Shapes match what Admin.tsx reads: events = array; bookings/users = { data, pagination }; stats 404 → the page
// falls back to counting the lists.
function respond(url: string) {
  if (url.startsWith("/api/events")) return json([sampleEvent]);
  if (url.startsWith("/api/admin/stats")) return json({ error: "not in test" }, 404);
  if (url.startsWith("/api/bookings") || url.startsWith("/api/auth/users"))
    return json({ data: [], pagination: { page: 1, totalPages: 1 } });
  return json([]);
}

describe("Admin page", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => respond(String(input instanceof Request ? input.url : input)));
  });
  afterEach(() => fetchSpy.mockRestore());

  function renderAdmin() {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Admin />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("asks the events API for past events too (admins manage events after they happen)", async () => {
    renderAdmin();
    await waitFor(() => {
      const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.startsWith("/api/events?") && u.includes("include=past"))).toBe(true);
    });
  });

  it("names row actions with the event they act on", async () => {
    renderAdmin();
    // Events live on their own tab; Radix renders inactive tab panels lazily, so check the accessible names exist
    // once the Events tab is shown.
    const eventsTab = await screen.findByRole("tab", { name: "Events" });
    eventsTab.focus();
    // Radix tabs activate on focus (automatic activation).
    await waitFor(() => expect(eventsTab).toHaveAttribute("data-state", "active"));
    expect(await screen.findByRole("button", { name: "Edit Past Gala" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seats for Past Gala" })).toBeInTheDocument();
    // The rarer actions (bookings, analytics, delete…) sit in a per-row menu whose trigger names the event too.
    expect(screen.getByRole("button", { name: "More actions for Past Gala" })).toBeInTheDocument();
  });

  it("captions its tables and uses h2 card titles under the h1 (no heading skip)", async () => {
    renderAdmin();
    await screen.findByRole("heading", { level: 1 });
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    for (const table of screen.queryAllByRole("table")) expect(table.querySelector("caption")?.textContent).toBeTruthy();
  });
});
