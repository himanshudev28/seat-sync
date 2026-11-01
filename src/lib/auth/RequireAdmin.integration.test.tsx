/**
 * Real AuthProvider + RequireAdmin against the exact /api/auth/me payload the server returns
 * (captured from the local server for the seeded admin). Guards the "/admin bounces an admin to /"
 * regression: the route guard must read `{ user: { is_admin } }`, never a flat body.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/providers/AuthProvider";
import { RequireAdmin } from "./RequireAuth";

const ME_ADMIN = {
  user: {
    _id: "6ae6275fb0c6e5d42b766d68",
    id: "6ae6275fb0c6e5d42b766d68",
    email: "admin@example.com",
    first_name: "Admin",
    last_name: "User",
    is_admin: true,
    avatar_url: null,
    student_id: null,
    phone_number: null,
    course: null,
    last_login: null,
    total_logins: 3,
    google_id: null,
    auth_provider: "local",
    created_at: "2026-10-31T17:00:00.000Z",
    updated_at: "2026-10-31T17:00:00.000Z",
    __v: 0,
  },
};

function renderAt(path: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<p>home</p>} />
            <Route path="/auth" element={<p>login</p>} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <p>admin dashboard</p>
                </RequireAdmin>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  if (typeof BroadcastChannel === "undefined") {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        onmessage: ((e: MessageEvent) => void) | null = null;
        postMessage() {}
        close() {}
      },
    );
  }
});
afterEach(() => vi.unstubAllGlobals());

describe("RequireAdmin with the real /me payload", () => {
  it("lets the seeded admin into /admin", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(ME_ADMIN), { status: 200 }));
    renderAt("/admin");
    expect(await screen.findByText("admin dashboard")).toBeInTheDocument();
  });

  it("sends a signed-in non-admin home", async () => {
    const body = { user: { ...ME_ADMIN.user, is_admin: false, email: "user@example.com" } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    renderAt("/admin");
    expect(await screen.findByText("home")).toBeInTheDocument();
  });

  it("sends an anonymous visitor to login", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }));
    renderAt("/admin");
    expect(await screen.findByText("login")).toBeInTheDocument();
  });
});
