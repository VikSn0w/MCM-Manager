import { describe, expect, it } from "vitest";
import {
  buildTrackLocks,
  checkStandardBookingAgainstLocks,
  hoursForChampionshipBooking,
  isDateFullyLocked,
  lockedHoursOnDate,
  parseLockedHours,
} from "./track-lock";

const ALL_SLOTS = ["09:00", "11:00", "14:00", "16:00"];

function champ(over: Partial<Parameters<typeof buildTrackLocks>[0][number]> = {}) {
  return {
    id: "c1",
    name: "Rental Race",
    fixedDate: "2026-07-19",
    isAvailable: true,
    lockMode: "FULL_DAY",
    lockedHours: null,
    ...over,
  };
}

describe("buildTrackLocks", () => {
  it("ignores championships with no scheduled date", () => {
    expect(buildTrackLocks([champ({ fixedDate: null })])).toHaveLength(0);
  });

  it("ignores championships that are switched off", () => {
    expect(buildTrackLocks([champ({ isAvailable: false })])).toHaveLength(0);
  });

  it("ignores a time window that reserves no slots", () => {
    // Otherwise an unconfigured window would silently behave like a full closure.
    const locks = buildTrackLocks([champ({ lockMode: "TIME_WINDOW", lockedHours: null })]);
    expect(locks).toHaveLength(0);
  });

  it("treats an unrecognised lock mode as a full day", () => {
    const [lock] = buildTrackLocks([champ({ lockMode: "NONSENSE" })]);
    expect(lock.mode).toBe("FULL_DAY");
  });

  it("carries the reserved slots for a time window", () => {
    const [lock] = buildTrackLocks([
      champ({ lockMode: "TIME_WINDOW", lockedHours: "09:00, 11:00" }),
    ]);
    expect(lock.mode).toBe("TIME_WINDOW");
    expect(lock.hours).toEqual(["09:00", "11:00"]);
  });
});

describe("parseLockedHours", () => {
  it("tolerates spacing and empty entries", () => {
    expect(parseLockedHours(" 09:00 ,, 11:00 ")).toEqual(["09:00", "11:00"]);
  });

  it("returns nothing for null", () => {
    expect(parseLockedHours(null)).toEqual([]);
  });
});

describe("standard bookings against locks", () => {
  const fullDay = buildTrackLocks([champ()]);
  const window = buildTrackLocks([
    champ({ lockMode: "TIME_WINDOW", lockedHours: "09:00, 11:00" }),
  ]);

  it("allows any date the event does not touch", () => {
    expect(checkStandardBookingAgainstLocks(fullDay, "2026-07-20", ["09:00"]).blocked).toBe(false);
  });

  it("blocks the whole day for a full-day event", () => {
    const r = checkStandardBookingAgainstLocks(fullDay, "2026-07-19", ["16:00"]);
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.reason).toBe("FULL_DAY");
  });

  it("blocks only the reserved slots for a window", () => {
    expect(checkStandardBookingAgainstLocks(window, "2026-07-19", ["14:00"]).blocked).toBe(false);

    const r = checkStandardBookingAgainstLocks(window, "2026-07-19", ["11:00", "16:00"]);
    expect(r.blocked).toBe(true);
    if (r.blocked && r.reason === "TIME_WINDOW") expect(r.hours).toEqual(["11:00"]);
  });

  it("lets a full-day event win over a window on the same date", () => {
    const both = buildTrackLocks([
      champ({ id: "a", lockMode: "TIME_WINDOW", lockedHours: "09:00" }),
      champ({ id: "b", name: "Big Event", lockMode: "FULL_DAY" }),
    ]);
    const r = checkStandardBookingAgainstLocks(both, "2026-07-19", ["16:00"]);
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.reason).toBe("FULL_DAY");
  });

  it("accumulates windows from several events on one date", () => {
    const both = buildTrackLocks([
      champ({ id: "a", lockMode: "TIME_WINDOW", lockedHours: "09:00" }),
      champ({ id: "b", lockMode: "TIME_WINDOW", lockedHours: "16:00" }),
    ]);
    expect([...lockedHoursOnDate(both, "2026-07-19")].sort()).toEqual(["09:00", "16:00"]);
  });
});

describe("hours a championship booking occupies", () => {
  it("takes every configured slot when it owns the day", () => {
    const [lock] = buildTrackLocks([champ()]);
    expect(hoursForChampionshipBooking(lock, ALL_SLOTS)).toEqual(ALL_SLOTS);
  });

  it("takes only its window otherwise", () => {
    const [lock] = buildTrackLocks([
      champ({ lockMode: "TIME_WINDOW", lockedHours: "11:00" }),
    ]);
    expect(hoursForChampionshipBooking(lock, ALL_SLOTS)).toEqual(["11:00"]);
  });

  it("takes nothing when the event imposes no lock", () => {
    expect(hoursForChampionshipBooking(undefined, ALL_SLOTS)).toEqual([]);
  });
});

describe("isDateFullyLocked", () => {
  it("is false when only a window is reserved", () => {
    const window = buildTrackLocks([
      champ({ lockMode: "TIME_WINDOW", lockedHours: "09:00" }),
    ]);
    expect(isDateFullyLocked(window, "2026-07-19")).toBe(false);
  });
});
