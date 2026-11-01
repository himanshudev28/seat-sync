import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ValidateTicket from "./ValidateTicket";

const auth = { profile: null as null | { is_admin: boolean } };
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => auth }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function renderAt(path = "/validate/tok123") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/validate/:bookingId" element={<ValidateTicket />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ValidateTicket", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    auth.profile = null;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opening the page only reads the ticket (GET); it never marks it used", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { valid: true, status: "confirmed", checkedIn: false, checkedInAt: null }));
    renderAt();
    expect(await screen.findByRole("heading", { name: /valid ticket/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method ?? "GET").toBe("GET");
    // Not an admin: no check-in button, a sign-in hint instead.
    expect(screen.queryByRole("button", { name: /mark as used/i })).toBeNull();
    expect(screen.getByRole("link", { name: /sign in as an organiser/i })).toBeInTheDocument();
  });

  it("an admin checks the ticket in with an explicit POST", async () => {
    auth.profile = { is_admin: true };
    fetchMock
      .mockResolvedValueOnce(json(200, { valid: true, status: "confirmed", checkedIn: false, checkedInAt: null }))
      .mockResolvedValueOnce(json(200, { result: "CHECKED_IN", checkedInAt: "2026-11-01T18:00:00.000Z", checkedInBy: "Door A" }));
    renderAt("/validate/tok123?event=ev9");
    await userEvent.click(await screen.findByRole("button", { name: /mark as used/i }));
    expect(await screen.findByRole("heading", { name: /checked in/i })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/validate/tok123");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ eventId: "ev9" });
  });

  it("already used, from the lookup, shows when", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { valid: true, status: "confirmed", checkedIn: true, checkedInAt: "2026-11-01T18:00:00.000Z" }));
    renderAt();
    expect(await screen.findByRole("heading", { name: /already used/i })).toBeInTheDocument();
  });

  it("a cancelled booking is not valid for entry", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { valid: false, status: "cancelled", checkedIn: false, checkedInAt: null }));
    renderAt();
    expect(await screen.findByRole("heading", { name: /not valid for entry/i })).toBeInTheDocument();
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it("404 shows invalid ticket", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { valid: false }));
    renderAt();
    expect(await screen.findByRole("heading", { name: /invalid ticket/i })).toBeInTheDocument();
  });
});
