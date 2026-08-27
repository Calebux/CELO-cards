// The two free matches every new player gets before a season pass is asked for.
//
// The counter lives under `free-games:<address>` and has always been read by
// /api/season-pass, which reports `freeGamesLeft` to the create screen. What it
// lacked was anywhere reliable to be WRITTEN: only the multiplayer path
// incremented it, so a player who stayed on VS House never spent one, and the
// gate never fired. This is the shared place both paths can count from.

import { redis } from "./redis";

/**
 * The slice of Redis this needs, injectable so the rule can be tested against a
 * fake store rather than the live one. Same seam as AgentStore in agentTrack.
 */
export type FreeGameStore = Pick<typeof redis, "get" | "incr" | "incrby">;

/** Matches the allowance reported by /api/season-pass. */
export const FREE_GAMES = 2;

type PassRecord = { expiry?: number };

/** An active season pass means unlimited play, so nothing is metered. */
async function hasActivePass(address: string, store: FreeGameStore): Promise<boolean> {
  const raw = await store.get<unknown>(`season-pass:${address.toLowerCase()}`);
  if (!raw) return false;
  const parsed: PassRecord | null =
    typeof raw === "string"
      ? (() => { try { return JSON.parse(raw) as PassRecord; } catch { return null; } })()
      : (raw as PassRecord);
  return Boolean(parsed && Number.isFinite(Number(parsed.expiry)) && Number(parsed.expiry) >= Date.now());
}

export type FreeGameResult = { allowed: true; remaining: number } | { allowed: false; remaining: 0 };

/**
 * Spend one free match, or report that there are none left.
 *
 * Fails OPEN: if Redis cannot be reached the match is allowed. Refusing to let
 * someone play because a cache blinked is a worse outcome than an
 * unmetered match, and the pass gate is a business rule rather than a
 * safety one.
 */
export async function consumeFreeGame(
  address: string,
  store: FreeGameStore = redis,
): Promise<FreeGameResult> {
  const addr = address.toLowerCase();

  try {
    if (await hasActivePass(addr, store)) return { allowed: true, remaining: FREE_GAMES };

    const key = `free-games:${addr}`;
    // INCR returns the value after the increment, so the first match reads 1.
    // Atomic on purpose: two matches opened at once cannot both see the same
    // count and both pass.
    const used = await store.incr(key);
    if (used > FREE_GAMES) {
      // Do not let a blocked attempt inflate the count — otherwise a player
      // who buys a pass later, then lets it lapse, is further behind than they
      // should be.
      await store.incrby(key, -1).catch(() => {});
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, FREE_GAMES - used) };
  } catch {
    return { allowed: true, remaining: FREE_GAMES };
  }
}
