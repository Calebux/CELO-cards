import assert from "node:assert/strict";
import test from "node:test";
import {
  DIFFICULTY_POINT_MULTIPLIER,
  gateDifficultyByPremium,
  houseMatchPoints,
  maxDifficultyForPremiumCount,
  PREMIUM_CARDS_FOR_BOSS,
  PREMIUM_CARDS_FOR_HARD,
} from "../app/lib/houseDifficulty";
import {
  readOwnedPremium,
  stripUnownedPremium,
  type PremiumStore,
} from "../app/lib/premiumOwnership";

// Hard and Boss are the tiers the leaderboard is actually made of, and they are
// now bought into. What matters is every way this could wrongly say yes: an
// unowned card in the deck, a difficulty escalated mid-match, a stale unlock
// list, or a Redis that cannot answer.

const PLAYER = "0x00000000000000000000000000000000000f1234";

function fakeStore(cards: string[], failing = false): PremiumStore {
  return {
    smembers: async () => {
      if (failing) throw new Error("redis down");
      return cards;
    },
  } as unknown as PremiumStore;
}

test("gate: no premium cards caps a player at Moderate", () => {
  assert.equal(maxDifficultyForPremiumCount(0), 1);
  // Asking for Hard or Boss with nothing owned yields Moderate, not a refusal.
  assert.equal(gateDifficultyByPremium(2, 0), 1);
  assert.equal(gateDifficultyByPremium(3, 0), 1);
  // Easy and Moderate stay open — a free player still plays and still scores.
  assert.equal(gateDifficultyByPremium(0, 0), 0);
  assert.equal(gateDifficultyByPremium(1, 0), 1);
});

test("gate: owning cards unlocks the tiers they pay for", () => {
  assert.equal(maxDifficultyForPremiumCount(PREMIUM_CARDS_FOR_HARD), 2);
  assert.equal(maxDifficultyForPremiumCount(PREMIUM_CARDS_FOR_BOSS), 3);
  assert.equal(gateDifficultyByPremium(2, PREMIUM_CARDS_FOR_HARD), 2);
  assert.equal(gateDifficultyByPremium(3, PREMIUM_CARDS_FOR_BOSS), 3);
  // One card short of Boss still tops out at Hard.
  assert.equal(gateDifficultyByPremium(3, PREMIUM_CARDS_FOR_BOSS - 1), 2);
});

test("gate: only ever clamps down, never promotes", () => {
  // A wallet with every card asking for Easy gets Easy. The gate is a ceiling,
  // not a floor — otherwise buying cards would force players into harder AI.
  assert.equal(gateDifficultyByPremium(0, 99), 0);
  assert.equal(gateDifficultyByPremium(1, 99), 1);
});

test("gate: junk ownership counts read as free tier", () => {
  assert.equal(maxDifficultyForPremiumCount(Number.NaN), 1);
  assert.equal(maxDifficultyForPremiumCount(-5), 1);
  assert.equal(maxDifficultyForPremiumCount(0.9), 1);
});

test("points: the free ceiling sits below the premium ceiling", () => {
  const freeCeiling = houseMatchPoints({ won: true, flawless: true, rewardDifficulty: gateDifficultyByPremium(3, 0) });
  const premiumCeiling = houseMatchPoints({ won: true, flawless: true, rewardDifficulty: gateDifficultyByPremium(3, PREMIUM_CARDS_FOR_BOSS) });
  assert.equal(freeCeiling, 225);   // 150 x 1.5
  assert.equal(premiumCeiling, 375); // 150 x 2.5
  assert.ok(freeCeiling < premiumCeiling);
  // The Hard flawless win the leaderboard is built from is now unreachable free.
  assert.equal(Math.round(150 * DIFFICULTY_POINT_MULTIPLIER[2]), 300);
});

test("deck: unowned premium cards are rejected, base cards pass", () => {
  const order = ["reversal_edge", "anticipation", "guard_stance", "stability", "rko"];
  const { kept, removed } = stripUnownedPremium(order, []);
  assert.deepEqual(removed, ["rko"]);
  assert.deepEqual(kept, ["reversal_edge", "anticipation", "guard_stance", "stability"]);
});

test("deck: owned premium cards are kept", () => {
  const order = ["reversal_edge", "anticipation", "guard_stance", "stability", "rko"];
  const { kept, removed } = stripUnownedPremium(order, ["rko"]);
  assert.deepEqual(removed, []);
  assert.deepEqual(kept, order);
});

test("deck: an all-base deck is never touched", () => {
  const order = ["reversal_edge", "anticipation", "guard_stance", "stability", "phantom_break"];
  const { kept, removed } = stripUnownedPremium(order, []);
  assert.deepEqual(removed, []);
  assert.deepEqual(kept, order);
});

test("ownership: non-premium ids in the set do not unlock anything", async () => {
  // A stray id — a base card, or a premium card since retired — must not count
  // toward the tier thresholds.
  const owned = await readOwnedPremium(PLAYER, fakeStore(["reversal_edge", "not_a_card", "rko"]));
  assert.deepEqual(owned, ["rko"]);
  assert.equal(maxDifficultyForPremiumCount(owned.length), 2);
});

test("ownership: an unreachable store fails closed to the free tier", async () => {
  const owned = await readOwnedPremium(PLAYER, fakeStore([], true));
  assert.deepEqual(owned, []);
  // Failing open here would hand every player the paid tiers whenever the cache
  // blinked — the opposite of consumeFreeGame, which fails open on purpose.
  assert.equal(gateDifficultyByPremium(3, owned.length), 1);
});

// ── The gate caps pay, never the opponent ────────────────────────────────────
// It briefly capped both, which deleted the House Boss: the chamber finale asks
// for tier 3, and clamping the AI to the reward ceiling handed anyone with one
// or two cards a Hard opponent wearing the boss's name. One player beat the
// boss in the three weeks before that shipped; five beat it in the two days
// after. These pin the two apart.

import { effectiveAiDifficulty } from "../app/lib/houseDifficulty";

test("the chamber finale still escalates to the boss for a one-card wallet", () => {
  // Reward pinned to Hard by the gate...
  const rewardDifficulty = gateDifficultyByPremium(2, PREMIUM_CARDS_FOR_HARD);
  assert.equal(rewardDifficulty, 2);
  // ...but the finale's request for tier 3 is honoured in full.
  assert.equal(effectiveAiDifficulty(rewardDifficulty, 3), 3);
});

test("a wallet with no cards still meets the real boss in the chamber", () => {
  const rewardDifficulty = gateDifficultyByPremium(2, 0);
  assert.equal(rewardDifficulty, 1, "paid at Moderate");
  assert.equal(effectiveAiDifficulty(rewardDifficulty, 3), 3, "but fights the boss");
});

test("escalation never lowers the opponent below the paid tier", () => {
  // A stale or malicious request asking for something easier is ignored.
  assert.equal(effectiveAiDifficulty(2, 0), 2);
  assert.equal(effectiveAiDifficulty(3, 1), 3);
});
