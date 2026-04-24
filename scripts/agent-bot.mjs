/**
 * Action Order — Agent Bot (multi-wallet rotation, continuous)
 * Plays matches on-chain to generate activity for Talent Protocol.
 *
 * Usage:
 *   node scripts/agent-bot.mjs
 *
 * Runs continuously until the treasury CELO is exhausted.
 * On first run: generates NUM_WALLETS wallets, saves keys to .env.local,
 * then auto-funds each from the treasury (0.04 CELO each).
 *
 * Net cost per match: gas only (~0.002 CELO)
 * With 8 CELO funding: ~2000+ matches across wallets
 *
 * Crash recovery: auto-restarts up to MAX_RESTARTS times with backoff.
 */

import { createWalletClient, createPublicClient, http, keccak256, toHex, parseEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { celo } from "viem/chains";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load .env.local ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH  = resolve(__dirname, "../.env.local");

if (existsSync(ENV_PATH)) {
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const RPC           = "https://celo-mainnet.g.alchemy.com/v2/5TkObpGZSAQ-ntN5ZFswA";
const ARENA_ADDRESS = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const TREASURY_KEY  = process.env.TREASURY_PRIVATE_KEY;
const ENTRY_FEE     = 7_000_000_000_000n;        // 0.000007 CELO
const FUND_AMOUNT   = parseEther("0.04");          // sent to each wallet when low
const MIN_BAL       = parseEther("0.03");          // refund threshold
const NUM_WALLETS        = 10;
const TREASURY_STOP_BAL  = parseEther("0.05"); // stop funding when treasury < this
const MAX_RESTARTS       = 10;                  // crash recovery limit
const BASE_RESTART_DELAY = 5_000;               // 5s base, doubles on each retry

if (!ARENA_ADDRESS || ARENA_ADDRESS === "0x0000000000000000000000000000000000000000") {
  console.error("❌  NEXT_PUBLIC_ARENA_ADDRESS not set in .env.local"); process.exit(1);
}
if (!TREASURY_KEY) {
  console.error("❌  TREASURY_PRIVATE_KEY not set in .env.local"); process.exit(1);
}

const ARENA_ABI = [
  {
    name: "enterMatchWithCelo",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "completeMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "winner",  type: "address" },
    ],
    outputs: [],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getOrCreateKey(envKey) {
  if (process.env[envKey]) return process.env[envKey];

  const newKey = generatePrivateKey();
  let content  = readFileSync(ENV_PATH, "utf8");

  // Append if key line doesn't exist at all
  if (!content.includes(`${envKey}=`)) {
    content += `\n${envKey}=${newKey}`;
  } else {
    content = content.replace(`${envKey}=`, `${envKey}=${newKey}`);
  }
  writeFileSync(ENV_PATH, content);
  process.env[envKey] = newKey;
  return newKey;
}

function matchIdToBytes32(id) { return keccak256(toHex(id)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtCelo(wei) { return (Number(wei) / 1e18).toFixed(6); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pub       = createPublicClient({ chain: celo, transport: http(RPC) });
  const treasury  = privateKeyToAccount(TREASURY_KEY);
  const treClient = createWalletClient({ account: treasury, chain: celo, transport: http(RPC) });

  // Build 10 bot accounts
  const bots = [];
  for (let i = 1; i <= NUM_WALLETS; i++) {
    const key     = getOrCreateKey(`BOT_WALLET_${i}_KEY`);
    const account = privateKeyToAccount(key);
    const client  = createWalletClient({ account, chain: celo, transport: http(RPC) });
    bots.push({ account, client, label: `W${i}` });
  }

  // Fetch all balances
  const balTre  = await pub.getBalance({ address: treasury.address });
  const balances = await Promise.all(bots.map(b => pub.getBalance({ address: b.account.address })));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Action Order — Agent Bot (${NUM_WALLETS}-wallet rotation)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Arena:    ${ARENA_ADDRESS}`);
  console.log(`  Treasury: ${treasury.address}  (${fmtCelo(balTre)} CELO)`);
  bots.forEach((b, i) => console.log(`  ${b.label}:       ${b.account.address}  (${fmtCelo(balances[i])} CELO)`));
  console.log(`  Mode:     continuous (runs until treasury < ${fmtCelo(TREASURY_STOP_BAL)} CELO)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Manually track treasury nonce to avoid "nonce too low" on rapid sequential sends
  let treNonce = await pub.getTransactionCount({ address: treasury.address });

  // Auto-fund any wallet below minimum
  const needsFunding = bots.filter((b, i) => balances[i] < MIN_BAL);
  if (needsFunding.length > 0) {
    const totalNeeded = BigInt(needsFunding.length) * FUND_AMOUNT;
    if (balTre < totalNeeded) {
      console.error(`❌  Treasury needs ${fmtCelo(totalNeeded)} CELO to fund ${needsFunding.length} wallets (has ${fmtCelo(balTre)})`);
      process.exit(1);
    }

    console.log(`💸  Funding ${needsFunding.length} wallets from treasury…\n`);
    for (const bot of needsFunding) {
      const hash = await treClient.sendTransaction({
        to: bot.account.address,
        value: FUND_AMOUNT,
        gas: 21_000n,
        nonce: treNonce++,
      });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`  Funded ${bot.label} (${bot.account.address}) — ${fmtCelo(FUND_AMOUNT)} CELO`);
      await sleep(300);
    }
    console.log();
  }

  // Treasury queue — serialises all treasury txs to avoid nonce conflicts
  let treasuryQueue = Promise.resolve();
  let treasuryDepleted = false;

  async function resyncNonce() {
    treNonce = await pub.getTransactionCount({ address: treasury.address, blockTag: "pending" });
  }

  function queueTreasury(fn) {
    treasuryQueue = treasuryQueue.then(fn).catch(async (e) => {
      console.log(`[treasury] ⚠️  tx error — resyncing nonce: ${e.message?.slice(0, 60)}`);
      await resyncNonce();
      throw e; // re-throw so the caller's catch still fires
    });
    return treasuryQueue;
  }

  // Shared counters
  let success = 0;
  let failed  = 0;

  async function walletLoop(bot) {
    // Stagger startup so wallets don't all begin at once (0–5 min random offset)
    const startDelay = Math.floor(Math.random() * 5 * 60 * 1000);
    await sleep(startDelay);

    // Continuous loop — runs until treasury is depleted
    while (!treasuryDepleted) {
      const bal = await pub.getBalance({ address: bot.account.address });
      if (bal < MIN_BAL) {
        console.log(`[${bot.label}] 💸 low balance — topping up from treasury…`);
        try {
          await queueTreasury(async () => {
            // Re-check treasury before each fund tx
            const treBal = await pub.getBalance({ address: treasury.address });
            if (treBal < TREASURY_STOP_BAL + FUND_AMOUNT) {
              console.log(`\n💀  Treasury low (${fmtCelo(treBal)} CELO) — stopping all wallets.`);
              treasuryDepleted = true;
              return;
            }
            const fundHash = await treClient.sendTransaction({
              to: bot.account.address,
              value: FUND_AMOUNT,
              gas: 21_000n,
              nonce: treNonce++,
            });
            await pub.waitForTransactionReceipt({ hash: fundHash, timeout: 120_000 });
            const remaining = await pub.getBalance({ address: treasury.address });
            console.log(`[${bot.label}] ✅ topped up 0.04 CELO  (treasury: ${fmtCelo(remaining)} CELO left)`);
          });
        } catch (e) {
          console.log(`[${bot.label}] ❌ top-up failed: ${e.message?.slice(0, 60)}`);
          await sleep(30_000); // wait 30s before retrying
          continue;
        }

        if (treasuryDepleted) break;
      }

      const matchId    = `AO-BOT-${Date.now()}-${bot.label}`;
      const matchBytes = matchIdToBytes32(matchId);

      // Random game duration 3–9 minutes
      const gameSec = Math.floor(Math.random() * (9 - 3 + 1)) + 3;
      const gameMs  = gameSec * 60 * 1000;

      try {
        const enterReceipt = await pub.waitForTransactionReceipt({
          hash: await bot.client.writeContract({
            address: ARENA_ADDRESS,
            abi: ARENA_ABI,
            functionName: "enterMatchWithCelo",
            args: [matchBytes],
            value: ENTRY_FEE,
            gas: 150_000n,
          }),
          timeout: 120_000,
        });

        if (enterReceipt.status === "reverted") {
          console.log(`[${bot.label}] ❌ enterMatch reverted`);
          failed++;
          await sleep(60_000); // 1 min backoff on revert
          continue;
        }

        console.log(`[${bot.label}] 🎮 entered — playing for ${gameSec}m…`);
        await sleep(gameMs);

        if (treasuryDepleted) break;

        await queueTreasury(async () => {
          const completeReceipt = await pub.waitForTransactionReceipt({
            hash: await treClient.writeContract({
              address: ARENA_ADDRESS,
              abi: ARENA_ABI,
              functionName: "completeMatch",
              args: [matchBytes, bot.account.address],
              gas: 150_000n,
              nonce: treNonce++,
            }),
            timeout: 120_000,
          });

          if (completeReceipt.status === "reverted") {
            console.log(`[${bot.label}] ❌ completeMatch reverted`);
            failed++;
          } else {
            success++;
            console.log(`[${bot.label}] ✅ match done  ${completeReceipt.transactionHash}  (total: ${success})`);
          }
        });
      } catch (e) {
        console.log(`[${bot.label}] ❌ ${e.message?.slice(0, 80)}`);
        failed++;
        await sleep(30_000); // 30s backoff on error
      }

      // Short cooldown between games for this wallet (1–3 min)
      const cooldown = Math.floor(Math.random() * (3 - 1 + 1) + 1) * 60 * 1000;
      await sleep(cooldown);
    }

    console.log(`[${bot.label}] stopped.`);
  }

  // Launch all wallet loops in parallel — they run independently
  await Promise.all(bots.map(bot => walletLoop(bot)));

  const finalBal = await pub.getBalance({ address: treasury.address });
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ✅ ${success} matches completed  |  ❌ ${failed} failed`);
  console.log(`  On-chain txs generated: ${success * 2}`);
  console.log(`  Treasury remaining: ${fmtCelo(finalBal)} CELO`);
  console.log(`  Contract: https://celoscan.io/address/${ARENA_ADDRESS}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ── Crash recovery wrapper ────────────────────────────────────────────────

let restarts = 0;

async function run() {
  try {
    await main();
  } catch (err) {
    if (restarts >= MAX_RESTARTS) {
      console.error(`\n💀  Bot crashed ${MAX_RESTARTS} times — giving up.`);
      console.error(err);
      process.exit(1);
    }
    const delay = BASE_RESTART_DELAY * Math.pow(2, restarts);
    restarts++;
    console.error(`\n⚠️  Bot crashed (attempt ${restarts}/${MAX_RESTARTS}). Restarting in ${delay / 1000}s…`);
    console.error(err?.message ?? err);
    setTimeout(run, delay);
  }
}

run();
