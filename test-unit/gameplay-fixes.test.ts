import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRound, type RoundOptions } from "../app/lib/combatEngine";
import { CHARACTERS, type Card } from "../app/lib/gameData";
import { withMatchLock } from "../app/lib/matchLock";
import {
  slotBindingViolation,
  MATCH_ACTION_TYPED_DOMAIN,
  MATCH_ACTION_TYPED_TYPES,
  buildMatchActionTypedMessage,
  buildMatchActionIntent,
  verifyMatchActionSignature,
} from "../app/lib/matchAuth";
import { privateKeyToAccount } from "viem/accounts";
import { computeOrderCommit, verifyOrderReveal } from "../app/lib/commitReveal";
import { newCommitSalt } from "../app/lib/commitRevealClient";

// Neutral character for both sides — Riven has no slot-level passive in the
// engine, so results reflect the cards/ults only. Same char both sides cancels
// the tiny priorityStat fraction in the priority comparison.
const RIVEN = CHARACTERS.find((c) => c.id === "riven")!;

let cid = 0;
function card(o: Partial<Card>): Card {
  return {
    id: `c${cid++}`, name: "T", type: "strike", priority: 10, knock: 10,
    energyCost: 1, effect: "", color: "#fff", bgColor: "#000", image: "", ...o,
  };
}
function five(first: Card): Card[] {
  return [first, card({}), card({}), card({}), card({})];
}
const origRandom = Math.random;
function withRandom<T>(v: number, fn: () => T): T {
  Math.random = () => v;
  try { return fn(); } finally { Math.random = origRandom; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── M-05: Kaira's guaranteed crit must cap at 2×, not stack to 4× ─────────────
test("M-05: guaranteed_crit does not stack with a random crit (caps at 2x)", () => {
  const player = five(card({ type: "strike", priority: 90, knock: 20 })); // wins slot 0 on priority
  const opp = five(card({ type: "strike", priority: 10, knock: 20 }));
  const opts: RoundOptions = { playerUltimateEffect: "guaranteed_crit", playerUltimateSlot: 0 };

  const withRandomCrit = withRandom(0, () => resolveRound(player, opp, RIVEN, RIVEN, opts));    // forces a random crit
  const noRandomCrit = withRandom(0.99, () => resolveRound(player, opp, RIVEN, RIVEN, opts));   // no random crit, ult only

  // Both are 2×. If the cap were broken, the forced-crit run would be 4×.
  assert.equal(withRandomCrit.slots[0].playerKnock, noRandomCrit.slots[0].playerKnock);
});

// ── M-05: the round is won by TOTAL knock, not slot count ─────────────────────
test("M-05: round winner is decided by total knock, not slots won", () => {
  const player = five(card({ type: "strike", priority: 90, knock: 300 })); // one huge slot win
  const opp = [
    card({ type: "strike", priority: 10, knock: 5 }),   // player wins this slot big
    card({ type: "strike", priority: 90, knock: 5 }),   // opponent wins slots 1-4 small
    card({ type: "strike", priority: 90, knock: 5 }),
    card({ type: "strike", priority: 90, knock: 5 }),
    card({ type: "strike", priority: 90, knock: 5 }),
  ];
  const r = withRandom(0.99, () => resolveRound(player, opp, RIVEN, RIVEN, {}));

  const playerSlots = r.slots.filter((s) => s.winner === "player").length;
  assert.ok(playerSlots < 3, `player should win a minority of slots, won ${playerSlots}`);
  assert.ok(r.totalPlayerKnock > r.totalOpponentKnock, "player should have more total knock");
  assert.equal(r.roundWinner, "player");
});

// ── M-05: Elara's priority_surge grants priority (first-strike), not +5 knock ─
test("M-05: priority_surge wins the clash on priority, adds no bonus knock", () => {
  // Same type, player is behind on priority by 2 with equal knock (3).
  const player = five(card({ type: "strike", priority: 10, knock: 3 }));
  const opp = five(card({ type: "strike", priority: 12, knock: 3 }));
  const opts: RoundOptions = { playerUltimateEffect: "priority_surge", playerUltimateSlot: 0 };

  const r = withRandom(0.99, () => resolveRound(player, opp, RIVEN, RIVEN, opts));

  // +5 priority (10→15 > 12) flips the winner to the player, who takes full card
  // knock (3). The old "+5 knock" behavior would instead give a losing player 1+5=6.
  assert.equal(r.slots[0].winner, "player");
  assert.equal(r.slots[0].playerKnock, 3);
});

// ── H-09: per-match lock enforces mutual exclusion — critical sections of
// concurrent writers to the SAME match never overlap ─────────────────────────
test("H-09: concurrent writers to one match never run at the same time", async () => {
  const matchId = `test-lock-${Date.now()}`;
  let active = 0;
  let maxActive = 0;
  const work = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(400);
    active--;
    return "OK";
  };
  const onBusy = () => "BUSY";

  await Promise.all([
    withMatchLock(matchId, work, onBusy),
    withMatchLock(matchId, work, onBusy),
    withMatchLock(matchId, work, onBusy),
  ]);

  // If the lock held, only one critical section ever ran at once.
  assert.equal(maxActive, 1);
});

// Sanity: two DIFFERENT matches are independent and may run concurrently.
test("H-09: different matches are not blocked by each other", async () => {
  let active = 0;
  let maxActive = 0;
  const work = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(400);
    active--;
    return "OK";
  };
  const onBusy = () => "BUSY";

  await Promise.all([
    withMatchLock(`test-lock-a-${Date.now()}`, work, onBusy),
    withMatchLock(`test-lock-b-${Date.now()}`, work, onBusy),
  ]);

  assert.equal(maxActive, 2); // independent locks → real concurrency
});

// ── C-01: immutable role binding — a slot's wallet can't be reassigned ────────
test("C-01: wager slot bound to one wallet rejects a different wallet", () => {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";
  // Bound to A, someone tries to register B → violation.
  assert.equal(slotBindingViolation({ mode: "wager", boundAddress: A, incomingAddress: B }), true);
  // Same wallet (any case) → fine.
  assert.equal(slotBindingViolation({ mode: "wager", boundAddress: A, incomingAddress: A.toUpperCase() }), false);
  // First bind (slot empty) → fine.
  assert.equal(slotBindingViolation({ mode: "wager", boundAddress: undefined, incomingAddress: A }), false);
});

test("C-01: binding is not enforced on casual until MATCH_AUTH_REQUIRED", () => {
  const A = "0x1111111111111111111111111111111111111111";
  const B = "0x2222222222222222222222222222222222222222";
  // Casual + flag off → not enforced (current behavior unchanged).
  assert.equal(slotBindingViolation({ mode: "casual", boundAddress: A, incomingAddress: B, authRequired: false }), false);
  // Any mode once auth is required → enforced.
  assert.equal(slotBindingViolation({ mode: "casual", boundAddress: A, incomingAddress: B, authRequired: true }), true);
});

// ── C-01/H-08: commit-reveal — a reveal must match the commit exactly ─────────
test("commit-reveal: a correct reveal verifies; tampering does not", () => {
  const order = ["fire", "bite", "headbutt", "jaw_breaker", "go_to_hell"];
  const salt = "s0m3-r4nd0m-salt-value";
  const commit = computeOrderCommit(order, salt);

  assert.match(commit, /^0x[0-9a-f]{64}$/);
  assert.equal(computeOrderCommit(order, salt), commit); // deterministic
  assert.equal(verifyOrderReveal(order, salt, commit), true); // correct reveal

  // Any tampering fails:
  assert.equal(verifyOrderReveal(["bite", "fire", "headbutt", "jaw_breaker", "go_to_hell"], salt, commit), false); // reordered
  assert.equal(verifyOrderReveal(["fire", "bite", "headbutt", "jaw_breaker", "halo_shield"], salt, commit), false); // card swapped
  assert.equal(verifyOrderReveal(order, "different-salt", commit), false); // wrong salt
  assert.equal(verifyOrderReveal(order, "short", commit), false); // salt too short
  assert.equal(verifyOrderReveal(order, salt, "0xdeadbeef"), false); // malformed commit
});

// Two players can't collide: different orders/salts give different commits, so
// one can't be reused for the other.
test("commit-reveal: distinct orders/salts produce distinct commits", () => {
  const c1 = computeOrderCommit(["fire", "bite"], "salt-aaaaaaaa");
  const c2 = computeOrderCommit(["bite", "fire"], "salt-aaaaaaaa");
  const c3 = computeOrderCommit(["fire", "bite"], "salt-bbbbbbbb");
  assert.notEqual(c1, c2);
  assert.notEqual(c1, c3);
});

// ── C-01: the readable EIP-712 match-action signature signs + verifies e2e, and
// its human-readable `intent` binds the sensitive payload (no blind bytes32) ────
test("match-action signature: readable typed data signs and verifies; tampering fails", async () => {
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const issuedAt = 1_700_000_000_000;
  const params = {
    wallet: account.address,
    matchId: "match-abc",
    role: "host" as const,
    action: "wager" as const,
    payload: { wagerCurrency: "usdt", wagerTx: "0xabc1230000000000000000000000000000000000000000000000000000000def" },
    issuedAt,
  };

  // The wallet would render this exact sentence — not an opaque hash.
  assert.match(buildMatchActionIntent(params.action, undefined, params.payload), /^Register wager stake in USDT · tx 0x/);

  const signature = await account.signTypedData({
    domain: MATCH_ACTION_TYPED_DOMAIN,
    types: MATCH_ACTION_TYPED_TYPES,
    primaryType: "MatchAction",
    message: buildMatchActionTypedMessage(params),
  });

  // Correct signer + identical payload → verifies.
  assert.equal(await verifyMatchActionSignature({ ...params, signature, now: issuedAt }), true);

  // Swapping the currency changes the intent the server rebuilds → verify fails
  // (proves the readable string still binds the sensitive payload).
  assert.equal(
    await verifyMatchActionSignature({ ...params, payload: { wagerCurrency: "usdc", wagerTx: params.payload.wagerTx }, signature, now: issuedAt }),
    false,
  );

  // Different action for the same signature → fails.
  assert.equal(await verifyMatchActionSignature({ ...params, action: "quit", signature, now: issuedAt }), false);
});

// ── C-01/H-08: the CLIENT commit the server VERIFIES must agree end-to-end ─────
test("commit-reveal: a client salt + commit verifies on the server", () => {
  const order = ["fire", "bite", "headbutt", "jaw_breaker", "go_to_hell"];
  const salt = newCommitSalt();

  // Salt is opaque enough: 32 hex chars, above the server's 8-char floor.
  assert.match(salt, /^[0-9a-f]{32}$/);
  assert.notEqual(newCommitSalt(), newCommitSalt()); // not constant

  // What the client sends as `commit` is exactly what the server recomputes on reveal.
  const commit = computeOrderCommit(order, salt);
  assert.equal(verifyOrderReveal(order, salt, commit), true);
});
