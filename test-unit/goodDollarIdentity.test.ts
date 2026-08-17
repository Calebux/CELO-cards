import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoodDollarIdentity, deriveGoodDollarStatus } from "../app/lib/gooddollar";

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

// --- expiry -----------------------------------------------------------------

const PERIOD_DAYS = 180n;
const DAY = 24 * 60 * 60;
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

const statusOf = (over: Partial<Parameters<typeof deriveGoodDollarStatus>[0]>) =>
  deriveGoodDollarStatus({
    address: LINKED,
    whitelistedRoot: ZERO,
    connectedRoot: ZERO,
    lastAuthenticated: 0n,
    authenticationPeriodDays: PERIOD_DAYS,
    ...over,
  });

test("a whitelisted wallet is verified, with its expiry projected forward", () => {
  const last = nowSec() - BigInt(10 * DAY);
  const s = statusOf({ address: ROOT, whitelistedRoot: ROOT, lastAuthenticated: last });

  assert.equal(s.status, "verified");
  assert.equal(s.root, ROOT);
  assert.ok(s.expiresAt !== null && s.expiresAt > Date.now(), "expiry should still be ahead");
});

test("an authentication record with no whitelist means expired, not never", () => {
  // The distinction the re-verify modal turns on: this person verified before
  // and needs to renew, rather than being pitched verification from scratch.
  const last = nowSec() - BigInt(200 * DAY);
  const s = statusOf({ lastAuthenticated: last });

  assert.equal(s.status, "expired");
  assert.ok(s.expiresAt !== null && s.expiresAt < Date.now(), "expiry should be in the past");
});

test("no authentication record at all means never verified", () => {
  const s = statusOf({});

  assert.equal(s.status, "never");
  assert.equal(s.expiresAt, null);
  assert.equal(s.root, null);
  assert.equal(s.identityKey, LINKED.toLowerCase());
});

test("a lapsed linked wallet still resolves to the root that holds its record", () => {
  // getWhitelistedRoot goes to zero once the identity expires, so without
  // connectedAccounts this wallet would look like a stranger who never verified.
  const s = statusOf({ connectedRoot: ROOT, lastAuthenticated: nowSec() - BigInt(200 * DAY) });

  assert.equal(s.status, "expired");
  assert.equal(s.root, ROOT);
  assert.equal(s.identityKey, ROOT.toLowerCase());
});

test("a verified linked wallet keys on the whitelisted root", () => {
  const s = statusOf({ whitelistedRoot: ROOT, connectedRoot: ROOT, lastAuthenticated: nowSec() });

  assert.equal(s.status, "verified");
  assert.equal(s.identityKey, ROOT.toLowerCase());
});
