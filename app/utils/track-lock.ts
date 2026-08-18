/**
 * A scheduled championship reserves the circuit on its date — either the whole
 * day or a window of session slots. These helpers are the single definition of
 * that rule, shared by the booking action and the booking form so the two can
 * never disagree about what is available.
 *
 * Must stay free of server-only imports.
 */

export type TrackLock = {
  championshipId: string;
  championshipName: string;
  date: string;
  /** FULL_DAY closes the date outright; TIME_WINDOW blocks only `hours`. */
  mode: "FULL_DAY" | "TIME_WINDOW";
  /** Slot times reserved. Empty for FULL_DAY, which reserves everything. */
  hours: string[];
};

type LockSource = {
  id: string;
  name: string;
  fixedDate: string | null;
  isAvailable: boolean;
  lockMode: string;
  lockedHours: string | null;
};

export function parseLockedHours(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

/**
 * Turns championship rows into the locks they impose. Only scheduled, active
 * championships reserve anything; a TIME_WINDOW with no hours set reserves
 * nothing, since blocking an unspecified window would be a silent full closure.
 */
export function buildTrackLocks(championships: LockSource[]): TrackLock[] {
  const locks: TrackLock[] = [];

  for (const c of championships) {
    if (!c.fixedDate || !c.isAvailable) continue;

    const mode = c.lockMode === "TIME_WINDOW" ? "TIME_WINDOW" : "FULL_DAY";
    const hours = parseLockedHours(c.lockedHours);

    if (mode === "TIME_WINDOW" && hours.length === 0) continue;

    locks.push({
      championshipId: c.id,
      championshipName: c.name,
      date: c.fixedDate,
      mode,
      hours: mode === "FULL_DAY" ? [] : hours,
    });
  }

  return locks;
}

/** Locks that apply on a given date. */
export function locksOnDate(locks: TrackLock[], date: string): TrackLock[] {
  return locks.filter((l) => l.date === date);
}

/** True when the whole date is reserved. */
export function isDateFullyLocked(locks: TrackLock[], date: string): boolean {
  return locksOnDate(locks, date).some((l) => l.mode === "FULL_DAY");
}

/** Slot times reserved on a date by TIME_WINDOW events. */
export function lockedHoursOnDate(locks: TrackLock[], date: string): Set<string> {
  const set = new Set<string>();
  locksOnDate(locks, date).forEach((l) => l.hours.forEach((h) => set.add(h)));
  return set;
}

export type LockConflict =
  | { blocked: false }
  | { blocked: true; reason: "FULL_DAY"; championshipName: string }
  | { blocked: true; reason: "TIME_WINDOW"; championshipName: string; hours: string[] };

/**
 * Whether an ordinary track booking may take these slots on this date.
 * Championship entries are exempt — they are the reason for the lock.
 */
export function checkStandardBookingAgainstLocks(
  locks: TrackLock[],
  date: string,
  requestedHours: string[]
): LockConflict {
  const onDate = locksOnDate(locks, date);
  if (onDate.length === 0) return { blocked: false };

  const fullDay = onDate.find((l) => l.mode === "FULL_DAY");
  if (fullDay) {
    return { blocked: true, reason: "FULL_DAY", championshipName: fullDay.championshipName };
  }

  for (const lock of onDate) {
    const clash = requestedHours.filter((h) => lock.hours.includes(h));
    if (clash.length > 0) {
      return {
        blocked: true,
        reason: "TIME_WINDOW",
        championshipName: lock.championshipName,
        hours: clash,
      };
    }
  }

  return { blocked: false };
}

/**
 * The slots a championship booking occupies: its reserved window, or every
 * configured slot when it takes the whole day.
 */
export function hoursForChampionshipBooking(
  lock: TrackLock | undefined,
  allSlotTimes: string[]
): string[] {
  if (!lock) return [];
  return lock.mode === "FULL_DAY" ? [...allSlotTimes] : [...lock.hours];
}
