/**
 * Minimal fixed-window rate limiter for credential endpoints.
 *
 * State lives in this process, so it protects a single instance only. Behind
 * multiple replicas or a serverless platform, move this to Redis or the
 * database — the interface is intentionally small enough to swap.
 */

type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();

// Bound the map so a flood of unique keys cannot grow it without limit.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = attempts.get(key);

  if (!existing || existing.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED_KEYS) sweep(now);
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Clears the counter for a key, e.g. after a successful login. */
export function resetRateLimit(key: string) {
  attempts.delete(key);
}

/**
 * Best-effort client identifier. Trusts the proxy headers the app is deployed
 * behind; falls back to a constant so the limiter still degrades to a global cap.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
