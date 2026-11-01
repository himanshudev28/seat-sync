import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useLocalStorage", () => {
  it("returns the initial value, then the stored one", () => {
    const { result, unmount } = renderHook(() => useLocalStorage("k", [1]));
    expect(result.current[0]).toEqual([1]);
    act(() => result.current[1]([2]));
    expect(JSON.parse(window.localStorage.getItem("k")!)).toEqual([2]);
    unmount();
    const again = renderHook(() => useLocalStorage("k", [1]));
    expect(again.result.current[0]).toEqual([2]);
  });

  it("composes rapid functional updates", () => {
    const { result } = renderHook(() => useLocalStorage("n", 0));
    act(() => {
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1);
    });
    expect(result.current[0]).toBe(3);
    expect(window.localStorage.getItem("n")).toBe("3");
  });

  it("resets to the initial value when another tab removes the key", () => {
    const { result } = renderHook(() => useLocalStorage("k", "init"));
    act(() => result.current[1]("changed"));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "k", newValue: null }));
    });
    expect(result.current[0]).toBe("init");
  });

  it("follows another tab's write and ignores bad JSON or other keys", () => {
    const { result } = renderHook(() => useLocalStorage("k", "init"));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "k", newValue: '"remote"' }));
    });
    expect(result.current[0]).toBe("remote");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "k", newValue: "{oops" }));
      window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: '"x"' }));
    });
    expect(result.current[0]).toBe("remote");
  });

  it("keeps two instances with the same key in sync in one tab", () => {
    const a = renderHook(() => useLocalStorage<string[]>("shared", []));
    const b = renderHook(() => useLocalStorage<string[]>("shared", []));
    act(() => a.result.current[1]((v) => [...v, "x"]));
    expect(b.result.current[0]).toEqual(["x"]);
    act(() => b.result.current[1]((v) => [...v, "y"]));
    expect(a.result.current[0]).toEqual(["x", "y"]);
  });

  it("does not throw on corrupt JSON", () => {
    window.localStorage.setItem("bad", "{nope");
    const { result } = renderHook(() => useLocalStorage("bad", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("does not throw when storage is blocked (Safari private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useLocalStorage("k", 1));
    expect(result.current[0]).toBe(1);
    expect(() => act(() => result.current[1](2))).not.toThrow();
    expect(result.current[0]).toBe(2);
  });
});
