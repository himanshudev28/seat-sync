import { describe, it, expect } from "vitest";
import { toLocalDateTimeParts, fromLocalDateTimeParts } from "./datetime";

describe("datetime helpers", () => {
  it("uses local fields for both date and time", () => {
    // Constructed from local fields, so the assertion holds in any timezone,
    // including IST where 02:30 local is the previous day in UTC.
    const early = new Date(2026, 5, 15, 2, 30);
    expect(toLocalDateTimeParts(early.toISOString())).toEqual({ date: "2026-06-15", time: "02:30" });
  });

  it("round-trips to the same instant", () => {
    const original = new Date(2026, 0, 1, 0, 5);
    const { date, time } = toLocalDateTimeParts(original.toISOString());
    expect(fromLocalDateTimeParts(date, time).getTime()).toBe(original.getTime());
  });

  it("zero-pads month, day and time", () => {
    expect(toLocalDateTimeParts(new Date(2026, 2, 4, 5, 6))).toEqual({ date: "2026-03-04", time: "05:06" });
  });
});
