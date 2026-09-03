// Server-authoritative premium card ownership.
//
// The record itself is written by the black market on a verified payment and
// moved by /api/trade; this is the read side, shared by everything that has to
// act on what a wallet actually paid for.
//
// It exists because ownership was, until now, only ever enforced in the client:
// the loadout screen filters CARDS by `unlockedPremiumCards` and the vs-house
// resolve route trusted whatever card ids arrived. That was survivable while
// premium cards were cosmetic-adjacent. It is not survivable now that owning
// them unlocks the scoring tiers — the filter has to live where the points are
// awarded.

import { CARDS } from "./gameData";
import { redis } from "./redis";

/** The slice of Redis this needs, injectable so the rules can be tested. */
export type PremiumStore = Pick<typeof redis, "smembers">;

export function ownedPremiumKey(address: string): string {
  return `owned-premium:${address.toLowerCase()}`;
}

const PREMIUM_CARD_IDS: ReadonlySet<string> = new Set(
  CARDS.filter((c) => c.isPremium).map((c) => c.id),
);

export function isPremiumCardId(cardId: string): boolean {
  return PREMIUM_CARD_IDS.has(cardId);
}

/**
 * Premium card ids a wallet owns, filtered to ids that are still premium cards
 * in the catalogue — the same validation the purchase route's GET applies, so a
 * card retired from the market cannot keep unlocking a tier.
 *
 * Fails CLOSED: an unreachable Redis returns no cards, so the wallet is treated
 * as free-tier for the match. The opposite default would hand every player the
 * paid tiers whenever the cache blinked, which is the failure that costs money.
 * This is the reverse of consumeFreeGame, which fails open on purpose — that
 * one decides whether someone may play at all, this one only decides how much
 * a match pays.
 */
export async function readOwnedPremium(
  address: string,
  store: PremiumStore = redis,
): Promise<string[]> {
  try {
    const owned = await store.smembers(ownedPremiumKey(address));
    return (owned ?? []).filter((id) => isPremiumCardId(id));
  } catch {
    return [];
  }
}

/**
 * Drop premium cards the wallet has not paid for from a submitted card order.
 *
 * Anything non-premium passes through untouched, so a free player's deck is
 * unchanged. Returns the kept ids and what was removed, because a silently
 * shortened deck would fail the `playerOrder.length < 5` check downstream and
 * read to the player as a broken match rather than an unowned card.
 */
export function stripUnownedPremium(
  cardIds: readonly string[],
  owned: readonly string[],
): { kept: string[]; removed: string[] } {
  const ownedSet = new Set(owned);
  const kept: string[] = [];
  const removed: string[] = [];
  for (const id of cardIds) {
    if (isPremiumCardId(id) && !ownedSet.has(id)) removed.push(id);
    else kept.push(id);
  }
  return { kept, removed };
}
