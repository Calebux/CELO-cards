import { redis } from "./redis";

// Best-effort per-match write lock (H-09). Serializes concurrent mutations to a
// single match so read-modify-write handlers can't clobber each other's writes.
// It intentionally falls through after a short wait rather than erroring, so a
// crashed request or a stuck lock can never wedge live gameplay — the TTL and
// owner-checked release below bound the worst case to a few seconds.

const LOCK_TTL_SECONDS = 15;      // longer than any handler's on-chain checks
const MAX_WAIT_MS = 2000;         // total time to wait for the lock before proceeding
const RETRY_MS = 100;

// Release only if we still own the lock, so an expired-then-reacquired lock held
// by another request is never deleted out from under it.
const RELEASE_IF_OWNER =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export async function withMatchLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  const key = `lock:match:${matchId}`;
  const token = crypto.randomUUID();
  let held = false;

  const attempts = Math.ceil(MAX_WAIT_MS / RETRY_MS);
  for (let i = 0; i < attempts; i++) {
    const ok = await redis.set(key, token, { nx: true, ex: LOCK_TTL_SECONDS }).catch(() => null);
    if (ok) { held = true; break; }
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }

  try {
    return await fn();
  } finally {
    if (held) {
      await redis.eval(RELEASE_IF_OWNER, [key], [token]).catch(() => {});
    }
  }
}
