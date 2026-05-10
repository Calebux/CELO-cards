import { redis } from "./redis";

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
