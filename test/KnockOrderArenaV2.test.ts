import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseUnits, keccak256, toHex, getAddress } from "viem";

const MATCH_A = keccak256(toHex("match-a"));
const MATCH_B = keccak256(toHex("match-b"));

describe("KnockOrderArenaV2", async () => {
  const { viem } = await network.connect();

  let usdt: Awaited<ReturnType<typeof viem.deployContract>>;
  let arena: Awaited<ReturnType<typeof viem.deployContract>>;
  let owner: `0x${string}`;
  let alice: `0x${string}`;
  let bob: `0x${string}`;
  let aliceClient: Awaited<ReturnType<typeof viem.getWalletClients>>[number];
  let bobClient: Awaited<ReturnType<typeof viem.getWalletClients>>[number];

  const stake = parseUnits("1", 6);

  beforeEach(async () => {
    const clients = await viem.getWalletClients();
    owner = clients[0].account.address;
    aliceClient = clients[1];
    bobClient = clients[2];
    alice = aliceClient.account.address;
    bob = bobClient.account.address;

    usdt = await viem.deployContract("MockERC20", ["USDT", 6]);
    arena = await viem.deployContract("KnockOrderArenaV2", [[usdt.address]]);

    await usdt.write.mint([alice, parseUnits("100", 6)]);
    await usdt.write.mint([bob, parseUnits("100", 6)]);
  });

  it("records plain-transfer stakes and settles 90% to the winner", async () => {
    // MiniPay path: plain transfers to the contract, then owner attribution
    await usdt.write.transfer([arena.address, stake], { account: aliceClient.account });
    await arena.write.recordStake([MATCH_A, alice, usdt.address, stake]);
    await usdt.write.transfer([arena.address, stake], { account: bobClient.account });
    await arena.write.recordStake([MATCH_A, bob, usdt.address, stake]);

    const before = await usdt.read.balanceOf([alice]) as bigint;
    await arena.write.completeMatch([MATCH_A, alice]);
    const after = await usdt.read.balanceOf([alice]) as bigint;

    assert.equal(after - before, stake * 2n * 9000n / 10000n); // 1.8 USDT
    // 10% fee remains as withdrawable surplus
    assert.equal(await arena.read.surplus([usdt.address]), stake * 2n * 1000n / 10000n);
  });

  it("rejects attribution not backed by contract balance", async () => {
    // No transfer happened — crediting must fail
    await assert.rejects(
      arena.write.recordStake([MATCH_A, alice, usdt.address, stake]),
      /unbacked credit/
    );
  });

  it("rejects double-credit of the same player and third stakers", async () => {
    await usdt.write.transfer([arena.address, stake * 3n], { account: aliceClient.account });
    await arena.write.recordStake([MATCH_A, alice, usdt.address, stake]);
    await assert.rejects(
      arena.write.recordStake([MATCH_A, alice, usdt.address, stake]),
      /already staked/
    );
    await arena.write.recordStake([MATCH_A, bob, usdt.address, stake]);
    await assert.rejects(
      arena.write.recordStake([MATCH_A, owner, usdt.address, stake]),
      /match full/
    );
  });

  it("supports the trustless approve + enterMatch path", async () => {
    await usdt.write.approve([arena.address, stake], { account: aliceClient.account });
    await arena.write.enterMatch([MATCH_B, usdt.address, stake], { account: aliceClient.account });

    const m = await arena.read.getMatch([MATCH_B]) as [string, number, bigint, bigint, string[], bigint[]];
    assert.equal(getAddress(m[0]), getAddress(usdt.address));
    assert.equal(m[1], 1); // Active
    assert.equal(m[3], stake); // pot
    assert.equal(getAddress(m[4][0]), getAddress(alice));
  });

  it("refunds all stakers", async () => {
    await usdt.write.transfer([arena.address, stake], { account: aliceClient.account });
    await arena.write.recordStake([MATCH_A, alice, usdt.address, stake]);
    await usdt.write.transfer([arena.address, stake], { account: bobClient.account });
    await arena.write.recordStake([MATCH_A, bob, usdt.address, stake]);

    const aliceBefore = await usdt.read.balanceOf([alice]) as bigint;
    const bobBefore = await usdt.read.balanceOf([bob]) as bigint;
    await arena.write.refundMatch([MATCH_A]);
    assert.equal((await usdt.read.balanceOf([alice]) as bigint) - aliceBefore, stake);
    assert.equal((await usdt.read.balanceOf([bob]) as bigint) - bobBefore, stake);
    assert.equal(await arena.read.totalCredited([usdt.address]), 0n);
  });

  it("withdrawFees cannot touch funds backing open matches", async () => {
    await usdt.write.transfer([arena.address, stake], { account: aliceClient.account });
    await arena.write.recordStake([MATCH_A, alice, usdt.address, stake]);

    await assert.rejects(
      arena.write.withdrawFees([usdt.address, 1n, owner]),
      /exceeds surplus/
    );

    // After settlement the fee is withdrawable
    await usdt.write.transfer([arena.address, stake], { account: bobClient.account });
    await arena.write.recordStake([MATCH_A, bob, usdt.address, stake]);
    await arena.write.completeMatch([MATCH_A, alice]);
    const fee = stake * 2n * 1000n / 10000n;
    await arena.write.withdrawFees([usdt.address, fee, owner]);
    assert.equal(await arena.read.surplus([usdt.address]), 0n);
  });

  it("rejects non-allowlisted tokens and non-owner settlement", async () => {
    const fake = await viem.deployContract("MockERC20", ["FAKE", 18]);
    await fake.write.mint([alice, stake]);
    await fake.write.approve([arena.address, stake], { account: aliceClient.account });
    await assert.rejects(
      arena.write.enterMatch([MATCH_B, fake.address, stake], { account: aliceClient.account }),
      /token not allowed/
    );

    await usdt.write.transfer([arena.address, stake], { account: aliceClient.account });
    await arena.write.recordStake([MATCH_A, alice, usdt.address, stake]);
    await assert.rejects(
      arena.write.completeMatch([MATCH_A, alice], { account: aliceClient.account }),
      /not owner/
    );
  });
});
