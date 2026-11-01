import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAdmin, RequireAuth } from "./RequireAuth";

const useAuth = vi.fn();
vi.mock("@/providers/AuthProvider", () => ({ useAuth: () => useAuth() }));

function AuthProbe() {
  const loc = useLocation();
  const from = (loc.state as { from?: { pathname: string } } | null)?.from;
  return <div>login from:{from?.pathname}</div>;
}

function renderAt(path: string, guard: "auth" | "admin") {
  const Guard = guard === "auth" ? RequireAuth : RequireAdmin;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/auth" element={<AuthProbe />} />
        <Route
          path="/secret"
          element={
            <Guard>
              <div>secret content</div>
            </Guard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const user = { id: "1", email: "a@b.c" };

beforeEach(() => useAuth.mockReset());

describe("RequireAuth", () => {
  it("shows the checking state while loading", () => {
    useAuth.mockReturnValue({ user: null, profile: null, isLoading: true });
    renderAt("/secret", "auth");
    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…");
    expect(screen.queryByText("secret content")).toBeNull();
  });

  it("redirects anonymous users to /auth carrying state.from", () => {
    useAuth.mockReturnValue({ user: null, profile: null, isLoading: false });
    renderAt("/secret", "auth");
    expect(screen.getByText("login from:/secret")).toBeInTheDocument();
  });

  it("renders children for a signed-in user", () => {
    useAuth.mockReturnValue({ user, profile: { is_admin: false }, isLoading: false });
    renderAt("/secret", "auth");
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });
});

describe("RequireAdmin", () => {
  it("shows the checking state while loading", () => {
    useAuth.mockReturnValue({ user: null, profile: null, isLoading: true });
    renderAt("/secret", "admin");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects anonymous users to /auth with state.from", () => {
    useAuth.mockReturnValue({ user: null, profile: null, isLoading: false });
    renderAt("/secret", "admin");
    expect(screen.getByText("login from:/secret")).toBeInTheDocument();
  });

  it("sends a non-admin to /", () => {
    useAuth.mockReturnValue({ user, profile: { is_admin: false }, isLoading: false });
    renderAt("/secret", "admin");
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it("renders children for an admin", () => {
    useAuth.mockReturnValue({ user, profile: { is_admin: true }, isLoading: false });
    renderAt("/secret", "admin");
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });
});
