import { redis } from "./redis";

// Strict per-match write lock (H-09). Serializes concurrent mutations to a
// single match via Redis so read-modify-write handlers can't clobber each
// other. Under contention it does NOT fall through and let two writers proceed
// — it invokes `onBusy` (the caller returns a retryable 409). The TTL plus the
// owner-checked Lua release bound a crashed/stuck lock to a few seconds.

const LOCK_TTL_SECONDS = 30;   // headroom over any handler's on-chain checks
const MAX_WAIT_MS = 2500;      // wait this long for the lock before declaring busy
const RETRY_MS = 100;

// Release only if we still own the lock, so an expired-then-reacquired lock
// held by another request is never deleted out from under it.
const RELEASE_IF_OWNER =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export async function withMatchLock<T>(
  matchId: string,
  fn: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  const key = `lock:match:${matchId}`;
  const token = crypto.randomUUID();

  let held = false;
  const attempts = Math.ceil(MAX_WAIT_MS / RETRY_MS);
  for (let i = 0; i < attempts; i++) {
    const ok = await redis.set(key, token, { nx: true, ex: LOCK_TTL_SECONDS }).catch(() => null);
    if (ok) { held = true; break; }
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }

  // Couldn't get exclusive access in time — refuse rather than risk a clobber.
  if (!held) return onBusy();

  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_IF_OWNER, [key], [token]).catch(() => {});
  }
}
