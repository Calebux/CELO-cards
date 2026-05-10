import { redis } from "./redis";

/**
 * Sanitize a player display name.
 * Trims whitespace, enforces max length, strips non-printable characters.
 * Returns null if the result is empty.
 */
export function sanitizePlayerName(raw: string | null | undefined, maxLen = 24): string | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip non-printable ASCII (control chars) and trim
  const cleaned = raw.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "").trim().slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Simple Redis-based sliding-window rate limiter.
 * Returns true if the request is allowed, false if the limit is exceeded.
 *
 * @param key    Unique identifier (e.g. `ratelimit:payout:0xabc`)
 * @param limit  Max requests allowed within the window
 * @param windowSec  Window size in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSec);
  }
  return current <= limit;
}
