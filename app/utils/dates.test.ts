import { afterEach, describe, expect, it, vi } from "vitest";
import { isTodayOrFuture, todayIso } from "./dates";

afterEach(() => {
  vi.useRealTimers();
});

/** Freeze the clock at a local wall-clock time. */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("todayIso", () => {
  it("formats with zero padding", () => {
    freeze("2026-03-05T10:00:00");
    expect(todayIso()).toBe("2026-03-05");
  });
});

describe("isTodayOrFuture", () => {
  it("counts today as bookable late in the evening", () => {
    // The bug this replaced: new Date("2026-07-19") is UTC midnight, so any
    // time later the same day compared as already past and same-day
    // cancellation was refused.
    freeze("2026-07-19T23:30:00");
    expect(isTodayOrFuture("2026-07-19")).toBe(true);
  });

  it("counts today as bookable just after midnight", () => {
    freeze("2026-07-19T00:01:00");
    expect(isTodayOrFuture("2026-07-19")).toBe(true);
  });

  it("accepts future dates", () => {
    freeze("2026-07-19T12:00:00");
    expect(isTodayOrFuture("2026-07-20")).toBe(true);
    expect(isTodayOrFuture("2027-01-01")).toBe(true);
  });

  it("rejects past dates", () => {
    freeze("2026-07-19T12:00:00");
    expect(isTodayOrFuture("2026-07-18")).toBe(false);
    expect(isTodayOrFuture("2025-12-31")).toBe(false);
  });

  it("compares correctly across month and year boundaries", () => {
    freeze("2026-12-31T22:00:00");
    expect(isTodayOrFuture("2026-12-31")).toBe(true);
    expect(isTodayOrFuture("2027-01-01")).toBe(true);
    expect(isTodayOrFuture("2026-12-30")).toBe(false);
  });
});
