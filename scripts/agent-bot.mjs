/**
 * Action Order — Agent Bot
 * Plays matches on-chain to generate activity for Talent Protocol.
 *
 * Usage:
 *   node scripts/agent-bot.mjs [number_of_matches]
 *
 * Examples:
 *   node scripts/agent-bot.mjs 20
 *   node scripts/agent-bot.mjs 100
 *
 * Flow per match:
 *   1. Bot calls enterMatchWithCelo (pays 0.000007 CELO)
 *   2. Treasury calls completeMatch  (bot gets 0.000007 CELO back)
 *   Net cost: gas only (~0.0002 CELO per match)
 *
 * Bot wallets are auto-generated on first run and saved to .env.local.
 * Fund each bot wallet with 0.05 CELO to run ~200 matches.
 */

import { createWalletClient, createPublicClient, http, keccak256, toHex } from "viem";
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
const RPC           = "https://forno.celo.org";
const ARENA_ADDRESS = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const TREASURY_KEY  = process.env.TREASURY_PRIVATE_KEY;
const ENTRY_FEE     = 7_000_000_000_000n; // 0.000007 CELO
const MATCHES       = parseInt(process.argv[2] ?? "20");

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

// ── Bot wallet helpers ────────────────────────────────────────────────────────
function getOrCreateKey(envKey, label) {
  if (process.env[envKey]) return process.env[envKey];

  const newKey = generatePrivateKey();
  let content  = readFileSync(ENV_PATH, "utf8");
  content      = content.replace(`${envKey}=`, `${envKey}=${newKey}`);
  writeFileSync(ENV_PATH, content);

  console.log(`🔑  Generated ${label}: ${newKey}`);
  console.log(`    Saved to .env.local as ${envKey}\n`);
  return newKey;
}

function matchIdToBytes32(id) { return keccak256(toHex(id)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtCelo(wei) { return (Number(wei) / 1e18).toFixed(6); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const botKeyA = getOrCreateKey("BOT_AGENT_A_KEY", "Bot A");
  const botKeyB = getOrCreateKey("BOT_AGENT_B_KEY", "Bot B");

  const treasury = privateKeyToAccount(TREASURY_KEY);
  const botA     = privateKeyToAccount(botKeyA);
  const botB     = privateKeyToAccount(botKeyB);

  const pub      = createPublicClient({ chain: celo, transport: http(RPC) });
  const treClient = createWalletClient({ account: treasury, chain: celo, transport: http(RPC) });
  const botAClient = createWalletClient({ account: botA, chain: celo, transport: http(RPC) });
  const botBClient = createWalletClient({ account: botB, chain: celo, transport: http(RPC) });

  // Balances
  const [balTre, balA, balB] = await Promise.all([
    pub.getBalance({ address: treasury.address }),
    pub.getBalance({ address: botA.address }),
    pub.getBalance({ address: botB.address }),
  ]);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Action Order — Agent Bot");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Arena:    ${ARENA_ADDRESS}`);
  console.log(`  Treasury: ${treasury.address}  (${fmtCelo(balTre)} CELO)`);
  console.log(`  Bot A:    ${botA.address}  (${fmtCelo(balA)} CELO)`);
  console.log(`  Bot B:    ${botB.address}  (${fmtCelo(balB)} CELO)`);
  console.log(`  Matches:  ${MATCHES}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Need CELO for gas + entry fee
  const MIN = ENTRY_FEE * 5n;
  const needFunding = [];
  if (balA < MIN) needFunding.push(`  Bot A: send 0.05 CELO to ${botA.address}`);
  if (balB < MIN) needFunding.push(`  Bot B: send 0.05 CELO to ${botB.address}`);

  if (needFunding.length === 2) {
    console.error("❌  Both bots need CELO for gas:\n" + needFunding.join("\n"));
    process.exit(1);
  }
  if (needFunding.length === 1) {
    console.log("⚠️  " + needFunding[0] + "  (continuing with other bot)\n");
  }

  let success = 0;
  let failed  = 0;

  for (let i = 0; i < MATCHES; i++) {
    // Alternate bots each match
    const useA      = i % 2 === 0;
    const bot       = useA ? botA : botB;
    const botClient = useA ? botAClient : botBClient;
    const botBal    = useA ? balA : balB;
    const label     = useA ? "A" : "B";

    if (botBal < MIN) {
      console.log(`[${i+1}/${MATCHES}] ⚠️  Bot ${label} low — skipping`);
      failed++; continue;
    }

    const matchId = `AO-BOT-${Date.now()}-${i}`;
    const matchBytes = matchIdToBytes32(matchId);

    try {
      // 1. Bot enters match (pays 0.000007 CELO into contract)
      const enterHash = await botClient.writeContract({
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "enterMatchWithCelo",
        args: [matchBytes],
        value: ENTRY_FEE,
        gas: 150_000n,
      });
      await pub.waitForTransactionReceipt({ hash: enterHash });

      // 2. Treasury completes match (bot wins, gets 0.000007 CELO back)
      const completeHash = await treClient.writeContract({
        address: ARENA_ADDRESS,
        abi: ARENA_ABI,
        functionName: "completeMatch",
        args: [matchBytes, bot.address],
        gas: 150_000n,
      });
      await pub.waitForTransactionReceipt({ hash: completeHash });

      success++;
      console.log(`[${i+1}/${MATCHES}] ✅ Bot ${label}  ${completeHash}`);
    } catch (e) {
      failed++;
      console.log(`[${i+1}/${MATCHES}] ❌ Bot ${label}  ${e.message?.slice(0, 80)}`);
    }

    await sleep(400);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ✅ ${success} matches completed  |  ❌ ${failed} failed`);
  console.log(`  On-chain txs generated: ${success * 2}`);
  console.log(`  Contract: https://celoscan.io/address/${ARENA_ADDRESS}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch(console.error);
