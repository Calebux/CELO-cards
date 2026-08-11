import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoodDollarIdentity } from "../app/lib/gooddollar";

const ZERO = "0x0000000000000000000000000000000000000000";
const ROOT = "0x98970A263e2eCC31375d030Eb84e42Ed45c3C58F";
const LINKED = "0x466cB8914c59A5E352D0745C08259B15f7759c00";

/** Stands in for a viem public client, returning a fixed getWhitelistedRoot result. */
function clientReturning(root: string) {
  return { readContract: async () => root } as unknown as Parameters<typeof resolveGoodDollarIdentity>[0];
}

test("a wallet that is its own root is verified and keys on itself", async () => {
  const identity = await resolveGoodDollarIdentity(clientReturning(ROOT), ROOT);

  assert.equal(identity.isVerified, true);
  assert.equal(identity.root, ROOT);
  assert.equal(identity.identityKey, ROOT.toLowerCase());
});

test("a linked wallet is verified but keys on the root, not itself", async () => {
  // The whole point of the migration: this wallet reads as false under
  // isWhitelisted, and must not get its own reward bucket.
  const identity = await resolveGoodDollarIdentity(clientReturning(ROOT), LINKED);

  assert.equal(identity.isVerified, true);
  assert.equal(identity.root, ROOT);
  assert.equal(identity.identityKey, ROOT.toLowerCase());
  assert.notEqual(identity.identityKey, LINKED.toLowerCase());
});

test("two wallets on one identity collapse to a single reward key", async () => {
  const first = await resolveGoodDollarIdentity(clientReturning(ROOT), ROOT);
  const second = await resolveGoodDollarIdentity(clientReturning(ROOT), LINKED);

  // If these ever differ, one human draws the daily reward twice.
  assert.equal(first.identityKey, second.identityKey);
});

test("an address with no identity is unverified and keys on itself", async () => {
  const identity = await resolveGoodDollarIdentity(clientReturning(ZERO), LINKED);

  assert.equal(identity.isVerified, false);
  assert.equal(identity.root, null);
  assert.equal(identity.identityKey, LINKED.toLowerCase());
});

test("the zero-address check is case-insensitive", async () => {
  const identity = await resolveGoodDollarIdentity(
    clientReturning("0x0000000000000000000000000000000000000000".toUpperCase().replace("0X", "0x")),
    LINKED,
  );

  assert.equal(identity.isVerified, false);
});
