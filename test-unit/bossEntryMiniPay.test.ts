import assert from "node:assert/strict";
import test from "node:test";

// recordMatch is signed by the player and priced in native CELO. A MiniPay
// wallet holds stablecoins, and MiniPay does not whitelist the call, so it can
// only fail there. The gate lives in bossEntryWillCharge, which every VS House
// and boss call site consults — this asserts it actually reads the flag, which
// it did not for the fortnight the call was live.
process.env.NEXT_PUBLIC_BOSS_ONCHAIN_ENTRY = "true";
process.env.NEXT_PUBLIC_MATCH_REGISTRY = "0xe9d61b9a0cbb6ef53af1ad63a9e16ca33869f44d";

const { bossEntryWillCharge } = await import("../app/lib/bossEntry");
const ADDR = "0x0067378592a4d0ccc3146dba13137e21589921ed";

test("bossEntry: a MiniPay wallet is never asked to sign recordMatch", () => {
  assert.equal(bossEntryWillCharge(ADDR, true), false);
});

test("bossEntry: web still records, so the on-chain count keeps rising", () => {
  assert.equal(bossEntryWillCharge(ADDR, false), true);
});

test("bossEntry: no wallet, nothing to sign", () => {
  assert.equal(bossEntryWillCharge(undefined, false), false);
  assert.equal(bossEntryWillCharge(undefined, true), false);
});
