/**
 * Booking dates are stored as plain "YYYY-MM-DD" strings with no timezone.
 *
 * `new Date("2026-08-18") >= new Date()` parses the left side as UTC midnight,
 * so a booking for *today* compares as already past and same-day cancellation
 * gets blocked. Comparing the date strings directly avoids that entirely.
 */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** True when `date` ("YYYY-MM-DD") is today or later. */
export function isTodayOrFuture(date: string): boolean {
  return date >= todayIso();
}
