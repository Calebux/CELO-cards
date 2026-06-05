/**
 * enter-matches.mjs
 * Each of 110 bot wallets calls enterMatchWithCelo() directly on the wager
 * contract — real CELO txs FROM each individual wallet for Talent Protocol DAU.
 *
 * Run: node --env-file=.env.local scripts/enter-matches.mjs [walletCount] [txsPerWallet] [walletIndexesCsv]
 */

import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, toHex, padHex } from "viem";
import { celo } from "viem/chains";
import { randomBytes } from "node:crypto";

const WAGER_CONTRACT = "0x80B10A44B0Ea03473707660Bc5767099710bBFE0";
const ENTRY_FEE = 7_000_000_000_000n;       // 0.000007 CELO
const GAS_LIMIT = 100_000n;
const MIN_BALANCE_PER_TX = parseEther("0.025"); // must cover fee + gas per entry
const FUND_TARGET_PER_TX = parseEther("0.05");  // top up to this per requested entry
const WALLET_COUNT = Number(process.argv[2] || process.env.BOT_WALLET_COUNT || "6");
const TXS_PER_WALLET = Number(process.argv[3] || process.env.BOT_TXS_PER_WALLET || "1");
const WALLET_INDEXES = (process.argv[4] || process.env.BOT_WALLET_INDEXES || "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

const WAGER_ABI = [
  {
    name: "enterMatchWithCelo",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
];

const publicClient = createPublicClient({ chain: celo, transport: http() });

function randomMatchId() {
  return padHex(toHex(randomBytes(4).toString("hex").toUpperCase()), { size: 32 });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function validateArgs() {
  if (!Number.isInteger(WALLET_COUNT) || WALLET_COUNT <= 0) {
    console.error("❌ walletCount must be a positive integer");
    process.exit(1);
  }
  if (!Number.isInteger(TXS_PER_WALLET) || TXS_PER_WALLET <= 0) {
    console.error("❌ txsPerWallet must be a positive integer");
    process.exit(1);
  }
}

function loadWallets() {
  const wallets = [];
  const indexes = WALLET_INDEXES.length > 0 ? WALLET_INDEXES : Array.from({ length: WALLET_COUNT }, (_, i) => i + 1);
  for (const i of indexes) {
    const key = process.env[`BOT_WALLET_${i}_KEY`];
    if (!key) { console.error(`❌ Missing BOT_WALLET_${i}_KEY`); process.exit(1); }
    wallets.push({ index: i, account: privateKeyToAccount(/** @type {`0x${string}`} */ (key)) });
  }
  return wallets;
}

// ── Fund wallets that are below minimum ──────────────────────────────────────

async function fundIfNeeded(wallets) {
  if (!process.env.TREASURY_PRIVATE_KEY) {
    console.error("❌ Missing TREASURY_PRIVATE_KEY");
    process.exit(1);
  }

  const minBalance = MIN_BALANCE_PER_TX * BigInt(TXS_PER_WALLET);
  const fundTarget = FUND_TARGET_PER_TX * BigInt(TXS_PER_WALLET);
  const treasury = privateKeyToAccount(/** @type {`0x${string}`} */ (process.env.TREASURY_PRIVATE_KEY));
  const balances = await Promise.all(wallets.map(w => publicClient.getBalance({ address: w.account.address })));

  const needed = wallets.filter((w, i) => balances[i] < minBalance);
  if (needed.length === 0) { console.log("✓ All wallets funded\n"); return; }

  const treasuryBal = await publicClient.getBalance({ address: treasury.address });
  const total = needed.reduce((sum, w) => {
    const idx = wallets.findIndex((wallet) => wallet.index === w.index);
    return sum + (fundTarget - balances[idx]);
  }, 0n);
  console.log(`💰 Treasury: ${(Number(treasuryBal) / 1e18).toFixed(4)} CELO — funding ${needed.length} wallets`);
  if (treasuryBal < total) {
    console.log(`⚠️  Need ${(Number(total) / 1e18).toFixed(4)} CELO, have ${(Number(treasuryBal) / 1e18).toFixed(4)} — topping up as many as possible`);
  }

  const wc = createWalletClient({ account: treasury, chain: celo, transport: http() });
  let nonce = await publicClient.getTransactionCount({ address: treasury.address });

  for (const w of needed) {
    const bal = await publicClient.getBalance({ address: w.account.address });
    const topup = fundTarget - bal;
    if (topup <= 0n) continue;
    try {
      const tx = await wc.sendTransaction({ to: w.account.address, value: topup, nonce });
      await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 90_000 });
      console.log(`  ✅ Bot ${w.index}: +${(Number(topup) / 1e18).toFixed(4)} CELO`);
      nonce++;
    } catch (err) {
      const msg = String(err.message);
      if (msg.includes("nonce too low") || msg.includes("already known")) { nonce++; continue; }
      console.log(`  ❌ Bot ${w.index}: ${msg.slice(0, 60)}`);
      nonce++;
    }
    await sleep(200);
  }
  console.log();
}

// ── Each wallet enters a match directly ──────────────────────────────────────

async function enterMatch(wallet) {
  const matchId = randomMatchId();
  const fees = await publicClient.estimateFeesPerGas();
  const data = encodeFunctionData({ abi: WAGER_ABI, functionName: "enterMatchWithCelo", args: [matchId] });
  const wc = createWalletClient({ account: wallet.account, chain: celo, transport: http() });

  const txHash = await wc.sendTransaction({
    to: /** @type {`0x${string}`} */ (WAGER_CONTRACT),
    data,
    value: ENTRY_FEE,
    gas: GAS_LIMIT,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
  return txHash;
}

async function enterMatchesForWallet(wallet) {
  const hashes = [];
  let error = null;
  for (let n = 1; n <= TXS_PER_WALLET; n++) {
    try {
      hashes.push(await enterMatch(wallet));
    } catch (err) {
      error = err;
      break;
    }
    if (n < TXS_PER_WALLET) await sleep(250);
  }
  return { hashes, error };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  validateArgs();
  const wallets = loadWallets();
  const totalTxs = wallets.length * TXS_PER_WALLET;
  console.log(`🤖 ${wallets.length} wallets × ${TXS_PER_WALLET} tx each → ${WAGER_CONTRACT}\n`);

  await fundIfNeeded(wallets);

  console.log(`⛓  Entering matches (${totalTxs} txs FROM individual wallets)...\n`);

  let ok = 0, fail = 0;

  // Batch into groups of 10 to avoid RPC overload
  for (let i = 0; i < wallets.length; i += 10) {
    const batch = wallets.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(w => enterMatchesForWallet(w)));
    for (let j = 0; j < batch.length; j++) {
      const w = batch[j];
      const r = results[j];
      if (r.status === "fulfilled") {
        const firstHash = r.value.hashes[0] ?? "";
        ok += r.value.hashes.length;
        if (r.value.error) {
          const missed = TXS_PER_WALLET - r.value.hashes.length;
          fail += missed;
          console.log(`  ❌ Bot ${w.index}: ${r.value.hashes.length}/${TXS_PER_WALLET} txs, first ${firstHash.slice(0, 20)}..., then ${String(r.value.error?.message).slice(0, 60)}`);
        } else {
          console.log(`  ✅ Bot ${w.index}: ${r.value.hashes.length}/${TXS_PER_WALLET} txs, first ${firstHash.slice(0, 20)}...`);
        }
      } else {
        console.log(`  ❌ Bot ${w.index}: ${String(r.reason?.message).slice(0, 60)}`);
        fail += TXS_PER_WALLET;
      }
    }
    await sleep(1000); // 1s between batches
  }

  console.log(`\n🏆 Done — ${ok} on-chain entries, ${fail} failed`);
  console.log(`🔗 https://celoscan.io/address/${WAGER_CONTRACT}`);
}

main().catch(console.error);
