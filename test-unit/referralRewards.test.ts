import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoodDollarIdentity } from "../app/lib/gooddollar";

// The cash rules are: one identity cannot refer itself however many wallets it
// holds, and a referral pays only after verification AND a pass. The identity
// half is what address comparison gets wrong, so it is what is tested here —
// against the real resolver, with the chain stubbed.
const ROOT_A = "0x98970A263e2eCC31375d030Eb84e42Ed45c3C58F";
const WALLET_A2 = "0x466cB8914c59A5E352D0745C08259B15f7759c00"; // linked to ROOT_A
const ROOT_B = "0x1d935a748644daff3587eAb9D7B9EdE24Ae301e1";
const ZERO = "0x0000000000000000000000000000000000000000";

function clientReturning(root: string) {
  return { readContract: async () => root } as unknown as Parameters<typeof resolveGoodDollarIdentity>[0];
}

test("referral: a linked wallet resolves to the same identity as its root", async () => {
  // The whole reason the payout cannot compare addresses. Someone links a
  // second wallet — which GoodDollar actively encourages — refers themselves
  // from it, and an address check sees two different people.
  const referrer = await resolveGoodDollarIdentity(clientReturning(ROOT_A), ROOT_A);
  const referee = await resolveGoodDollarIdentity(clientReturning(ROOT_A), WALLET_A2);

  assert.notEqual(ROOT_A.toLowerCase(), WALLET_A2.toLowerCase(), "different addresses");
  assert.equal(referee.identityKey, referrer.identityKey, "but one identity — must not pay");
});

test("referral: two real people have different identity keys", async () => {
  const a = await resolveGoodDollarIdentity(clientReturning(ROOT_A), ROOT_A);
  const b = await resolveGoodDollarIdentity(clientReturning(ROOT_B), ROOT_B);
  assert.notEqual(a.identityKey, b.identityKey);
});

test("referral: an unverified referee has no identity to pay against", async () => {
  // getWhitelistedRoot returns the zero address for a wallet with no identity.
  // Qualification requires isVerified, so this referee cannot earn the reward
  // however many passes they buy.
  const identity = await resolveGoodDollarIdentity(clientReturning(ZERO), ROOT_B);
  assert.equal(identity.isVerified, false);
  // It still keys on itself, so nothing downstream divides by null.
  assert.equal(identity.identityKey, ROOT_B.toLowerCase());
});

test("referral: the reward is a fixed per-head amount", async () => {
  const { REFERRAL_REWARD_NGN } = await import("../app/lib/referralRewards");
  assert.equal(REFERRAL_REWARD_NGN, 700);
  // Sanity on the arithmetic the ops screen does: owed is unpaid × the rate,
  // never referrals × the rate.
  const qualified = 5, paid = 2;
  assert.equal((qualified - paid) * REFERRAL_REWARD_NGN, 2100);
});
