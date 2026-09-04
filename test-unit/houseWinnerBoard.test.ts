import assert from "node:assert/strict";
import test from "node:test";

// The board's dedupe rule, exercised directly. The prize resets daily, so a
// repeat winner has one record per day they cleared the chamber — and the board
// listed every one. The same wallet appeared two and three times over, under
// whatever name it held that day, so one player read as two ("Umaribn" and
// "Umaribnt").

type Reward = { playerAddress: string; playerName: string | null; verifiedAt: number; rewardCode: string; status?: string };
const isVerified = (r: Reward) => r.status === "verified" && !!r.rewardCode;

/** Mirrors the reduction in app/api/house-winner/route.ts GET. */
function distinctWinners(all: Reward[]): Reward[] {
  const newestFirst = [...all].sort((a, b) => b.verifiedAt - a.verifiedAt);
  const byPlayer = new Map<string, Reward>();
  for (const reward of newestFirst) {
    const key = reward.playerAddress.toLowerCase();
    const held = byPlayer.get(key);
    if (!held || (!isVerified(held) && isVerified(reward))) byPlayer.set(key, reward);
  }
  return [...byPlayer.values()];
}

const UMARIBN = "0xe0bc834a2f7e175d349af57e67a6b0bbdaf569ac";
const ONAH = "0xbf989a4674978d1254ca64f5a16d5729083ff406";
const ABM = "0x180b92682e90cc6d28698fe24d8e914ddbbe853c";
const pend = (a: string, n: string, t: number): Reward => ({ playerAddress: a, playerName: n, verifiedAt: t, rewardCode: "", status: "pending" });

test("a wallet that won on two days appears once", () => {
  // The real board on 2026-09-04.
  const out = distinctWinners([
    pend(UMARIBN, "Umaribnt", 5), pend(ABM, "ABM", 4), pend(ONAH, "Onah", 3),
    pend(UMARIBN, "Umaribn", 2), pend(ONAH, "Onah", 1),
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(new Set(out.map((r) => r.playerAddress)), new Set([UMARIBN, ABM, ONAH]));
});

test("the surviving row carries the player's current name", () => {
  const out = distinctWinners([pend(UMARIBN, "Umaribn", 1), pend(UMARIBN, "Umaribnt", 2)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].playerName, "Umaribnt", "a retired name must not outlive the current one");
});

test("case differences in an address are the same player", () => {
  const out = distinctWinners([pend(ONAH.toUpperCase(), "Onah", 2), pend(ONAH, "Onah", 1)]);
  assert.equal(out.length, 1);
});

test("a verified claim outranks a newer pending one", () => {
  // Otherwise a player who has actually been paid displays as still waiting.
  const verified: Reward = { playerAddress: ABM, playerName: "ABM", verifiedAt: 1, rewardCode: "HOUSE-ABC", status: "verified" };
  const out = distinctWinners([pend(ABM, "ABM", 9), verified]);
  assert.equal(out.length, 1);
  assert.equal(out[0].rewardCode, "HOUSE-ABC");
});

test("distinct players are all kept", () => {
  assert.equal(distinctWinners([pend(UMARIBN, "U", 1), pend(ONAH, "O", 2), pend(ABM, "A", 3)]).length, 3);
  assert.equal(distinctWinners([]).length, 0);
});
