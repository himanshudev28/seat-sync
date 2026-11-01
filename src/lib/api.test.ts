import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, AUTH_EXPIRED_EVENT, apiFetch } from "./api";

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("always sends credentials: include", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await apiFetch("/api/x", { credentials: "omit" });
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("JSON-encodes objects and sets Content-Type", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await apiFetch("/api/x", { method: "POST", body: { a: 1 } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("passes FormData through untouched without a Content-Type", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const fd = new FormData();
    fd.append("f", "v");
    await apiFetch("/api/x", { method: "POST", body: fd });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(fd);
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
  });

  it("returns undefined for 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch("/api/x")).resolves.toBeUndefined();
  });

  it("returns parsed JSON on success", async () => {
    fetchMock.mockResolvedValue(json({ hello: "world" }));
    await expect(apiFetch("/api/x")).resolves.toEqual({ hello: "world" });
  });

  it("throws ApiError with the server's error message", async () => {
    fetchMock.mockResolvedValue(json({ error: "Nope" }, 400));
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Nope");
    expect(err.data).toEqual({ error: "Nope" });
  });

  it("falls back to 'Request failed (500)' for a non-JSON body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>boom</html>", { status: 500, headers: { "Content-Type": "text/html" } }));
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("Request failed (500)");
  });

  it("dispatches auth-expired on 401 for data URLs but not /api/auth/me", async () => {
    const handler = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    try {
      fetchMock.mockImplementation(async () => json({ error: "Unauthorized" }, 401));
      await expect(apiFetch("/api/bookings")).rejects.toBeInstanceOf(ApiError);
      expect(handler).toHaveBeenCalledTimes(1);

      await expect(apiFetch("/api/auth/me")).rejects.toBeInstanceOf(ApiError);
      await expect(apiFetch("/api/auth/login", { method: "POST", body: {} })).rejects.toBeInstanceOf(ApiError);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
    }
  });
});
