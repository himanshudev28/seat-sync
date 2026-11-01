import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_EXPIRED_EVENT } from "@/lib/api";
import { AuthProvider, useAuth } from "./AuthProvider";

const fetchMock = vi.fn();
const me = (user: Record<string, unknown>) => new Response(JSON.stringify({ user }), { status: 200 });
const rawUser = { id: "u1", email: "a@b.c", first_name: "Ann", is_admin: true };

let queryClient: QueryClient;

function setup() {
  queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAuth(), { wrapper });
}

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
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AuthProvider", () => {
  it("sets user and profile from /me 200", async () => {
    fetchMock.mockResolvedValue(me(rawUser));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({ id: "u1", email: "a@b.c" });
    expect(result.current.profile?.is_admin).toBe(true);
    expect(result.current.profile?.first_name).toBe("Ann");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("stays anonymous on /me 401", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it.each([
    ["5xx", () => new Response("{}", { status: 500 })],
    ["network error", () => Promise.reject(new TypeError("offline"))],
  ])("keeps an existing session on /me %s", async (_name, next) => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setSessionUser(rawUser));
    expect(result.current.user?.id).toBe("u1");

    fetchMock.mockImplementationOnce(async () => next());
    let signedIn = true;
    await act(async () => {
      signedIn = await result.current.refresh();
    });
    expect(signedIn).toBe(false);
    expect(result.current.user?.id).toBe("u1");
  });

  it("signOut POSTs logout, clears the user and the query cache", async () => {
    fetchMock.mockResolvedValueOnce(me(rawUser));
    const { result } = setup();
    await waitFor(() => expect(result.current.user).not.toBeNull());
    queryClient.setQueryData(["bookings"], [1, 2]);
    expect(queryClient.getQueryData(["bookings"])).toBeDefined();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => {
      await result.current.signOut();
    });
    const call = fetchMock.mock.calls.at(-1)!;
    expect(call[0]).toBe("/api/auth/logout");
    expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(queryClient.getQueryData(["bookings"])).toBeUndefined();
  });

  it("clears the user on an auth-expired event", async () => {
    fetchMock.mockResolvedValue(me(rawUser));
    const { result } = setup();
    await waitFor(() => expect(result.current.user).not.toBeNull());
    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });
    expect(result.current.user).toBeNull();
  });

  it("removes the legacy auth_token from localStorage on mount", async () => {
    window.localStorage.setItem("auth_token", "old");
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(window.localStorage.getItem("auth_token")).toBeNull();
  });

  it("useAuth throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});
