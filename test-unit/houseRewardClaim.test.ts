import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHouseClaimAuthMessage,
  claimableState,
  houseClaimKey,
  isVerifiedReward,
  MAX_POOL_PAYOUT_CENTS,
  REWARD_CENTS,
} from "../app/lib/houseReward";

// The claim pays real money from the treasury with no identity check behind it,
// so what matters is every way it could wrongly say yes: an unapproved win, a
// second claim, or a pool already spent.

const approved = { status: "verified" as const, rewardCode: "HOUSE-ABC123", rewardUsd: 5 };
const pending = { status: "pending" as const, rewardCode: "", rewardUsd: 5 };

test("an approved win with room in the pool is claimable", () => {
  assert.deepEqual(
    claimableState({ record: approved, alreadyClaimed: false, spentCents: 0 }),
    { claimable: true },
  );
});

test("a win still awaiting review is not claimable", () => {
  // This is the whole sybil defence — a farmed win must never pay itself out.
  const s = claimableState({ record: pending, alreadyClaimed: false, spentCents: 0 });
  assert.deepEqual(s, { claimable: false, reason: "pending-review" });
});

test("a verified status without a code is not an approval", () => {
  // Both halves are required, matching the board's own rule.
  assert.equal(isVerifiedReward({ status: "verified", rewardCode: "" }), false);
  assert.equal(isVerifiedReward({ status: "pending", rewardCode: "HOUSE-X" }), false);
  assert.equal(isVerifiedReward(null), false);
  assert.equal(isVerifiedReward(approved), true);
});

test("a wallet that has already claimed cannot claim again", () => {
  const s = claimableState({ record: approved, alreadyClaimed: true, spentCents: 0 });
  assert.deepEqual(s, { claimable: false, reason: "already-claimed" });
  // Checked before approval status, so a revoked record still reads as paid
  // rather than inviting a retry.
  const revoked = claimableState({ record: pending, alreadyClaimed: true, spentCents: 0 });
  assert.deepEqual(revoked, { claimable: false, reason: "already-claimed" });
});

test("a wallet with no win at all gets nothing", () => {
  assert.deepEqual(
    claimableState({ record: null, alreadyClaimed: false, spentCents: 0 }),
    { claimable: false, reason: "no-win" },
  );
});

test("the pool ceiling stops the last claim that would overshoot", () => {
  const oneLeft = MAX_POOL_PAYOUT_CENTS - REWARD_CENTS;
  assert.equal(claimableState({ record: approved, alreadyClaimed: false, spentCents: oneLeft }).claimable, true);
  const noneLeft = MAX_POOL_PAYOUT_CENTS - REWARD_CENTS + 1;
  assert.deepEqual(
    claimableState({ record: approved, alreadyClaimed: false, spentCents: noneLeft }),
    { claimable: false, reason: "pool-empty" },
  );
  // Exactly ten $5 prizes fit in the $50 pool, and no eleventh.
  assert.equal(MAX_POOL_PAYOUT_CENTS / REWARD_CENTS, 10);
});

test("the claim key is per wallet and case-insensitive", () => {
  const a = "0xAbC0000000000000000000000000000000000001";
  assert.equal(houseClaimKey(a), houseClaimKey(a.toLowerCase()));
  assert.notEqual(houseClaimKey(a), houseClaimKey("0xabc0000000000000000000000000000000000002"));
});

test("the signed message binds the claim to one wallet", () => {
  const a = "0xAbC0000000000000000000000000000000000001";
  const msg = buildHouseClaimAuthMessage(a);
  assert.ok(msg.includes(a.toLowerCase()), "carries the claimant");
  // A signature captured for one wallet cannot be replayed for another.
  assert.notEqual(msg, buildHouseClaimAuthMessage("0xabc0000000000000000000000000000000000002"));
});
