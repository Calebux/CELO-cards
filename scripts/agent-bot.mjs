/**
 * Knock Order — Agent Bot
 * ──────────────────────
 * Simulates full game matches between agent wallets and generates
 * real on-chain cUSD transactions on Celo mainnet.
 *
 * Usage:
 *   node scripts/agent-bot.mjs [--matches 10] [--delay 30] [--app-url https://your-app.vercel.app]
 *
 * Each match:
 *   1. Agent A sends 0.1 cUSD to treasury (wager)
 *   2. Agent B sends 0.1 cUSD to treasury (wager)
 *   3. Game resolves offline (same logic as the UI)
 *   4. POST /api/payout → treasury sends 0.18 cUSD to the winner
 *
 * Env vars read from .env.local (or process.env):
 *   TREASURY_PRIVATE_KEY         — treasury wallet private key
 *   NEXT_PUBLIC_TREASURY_ADDRESS — treasury wallet address
 *   BOT_AGENT_A_KEY              — agent A private key (auto-generated if missing)
 *   BOT_AGENT_B_KEY              — agent B private key (auto-generated if missing)
 *   NEXT_PUBLIC_APP_URL          — deployed app URL for payout calls
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { celo } from "viem/chains";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Config ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env.local if it exists
const envPath = resolve(ROOT, ".env.local");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : fallback;
};

const NUM_MATCHES  = parseInt(getArg("--matches", "5"), 10);
const DELAY_SEC    = parseInt(getArg("--delay", "20"), 10);
const APP_URL      = getArg("--app-url", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

const TREASURY_KEY  = process.env.TREASURY_PRIVATE_KEY;
const TREASURY_ADDR = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;

if (!TREASURY_KEY || !TREASURY_ADDR) {
  console.error("❌  Missing TREASURY_PRIVATE_KEY or NEXT_PUBLIC_TREASURY_ADDRESS in .env.local");
  process.exit(1);
}

// ── Agent wallets ───────────────────────────────────────────────────────────

function getOrCreateAgentKey(envVar, label) {
  if (process.env[envVar]) return process.env[envVar];
  const pk = generatePrivateKey();
  console.log(`\n🔑  Generated new ${label} key: ${pk}`);
  console.log(`    Add to .env.local as ${envVar}=${pk} to reuse.\n`);
  return pk;
}

const AGENT_A_KEY = getOrCreateAgentKey("BOT_AGENT_A_KEY", "Agent A");
const AGENT_B_KEY = getOrCreateAgentKey("BOT_AGENT_B_KEY", "Agent B");

const agentA = privateKeyToAccount(AGENT_A_KEY);
const agentB = privateKeyToAccount(AGENT_B_KEY);

console.log(`🤖  Agent A: ${agentA.address}`);
console.log(`🤖  Agent B: ${agentB.address}`);
console.log(`🏦  Treasury: ${TREASURY_ADDR}`);
console.log(`🌐  App URL: ${APP_URL}`);
console.log(`🎮  Matches: ${NUM_MATCHES}  |  Delay: ${DELAY_SEC}s between matches\n`);

// ── Viem clients ────────────────────────────────────────────────────────────

const CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // Celo mainnet cUSD

const ERC20_ABI = [
  { name: "transfer",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
];

const WAGER  = parseUnits("0.1",  18); // 0.1 cUSD
const PAYOUT = parseUnits("0.18", 18); // 0.18 cUSD

const publicClient = createPublicClient({ chain: celo, transport: http() });

function walletFor(pk) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: celo, transport: http() });
}

// ── cUSD helpers ────────────────────────────────────────────────────────────

async function getBalance(address) {
  return publicClient.readContract({ address: CUSD, abi: ERC20_ABI, functionName: "balanceOf", args: [address] });
}

async function transferCUSD(walletClient, to, amount, label) {
  const { request } = await publicClient.simulateContract({
    account: walletClient.account,
    address: CUSD,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amount],
  });
  const hash = await walletClient.writeContract(request);
  console.log(`  💸  ${label} → tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ── Game simulation (mirrors combatEngine.ts) ───────────────────────────────

const CARDS = [
  { id: "phantom_break",    type: "strike",  priority: 2, knock: 6,  energyCost: 2 },
  { id: "storm_kick",       type: "strike",  priority: 3, knock: 5,  energyCost: 2 },
  { id: "power_punch",      type: "strike",  priority: 1, knock: 8,  energyCost: 3 },
  { id: "direct_impact",    type: "strike",  priority: 4, knock: 4,  energyCost: 1 },
  { id: "finisher",         type: "strike",  priority: 1, knock: 10, energyCost: 4 },
  { id: "guard_stance",     type: "defense", priority: 2, knock: 2,  energyCost: 1 },
  { id: "stability",        type: "defense", priority: 1, knock: 1,  energyCost: 1 },
  { id: "reversal_edge",    type: "defense", priority: 3, knock: 4,  energyCost: 4 },
  { id: "anticipation",     type: "defense", priority: 5, knock: 3,  energyCost: 0 },
  { id: "mind_game",        type: "control", priority: 4, knock: 3,  energyCost: 3 },
  { id: "evasion",          type: "control", priority: 5, knock: 2,  energyCost: 1 },
  { id: "pressure_advance", type: "control", priority: 3, knock: 5,  energyCost: 2 },
  { id: "disrupt",          type: "control", priority: 2, knock: 4,  energyCost: 2 },
];

function typeAdv(a, b) {
  if (a === b) return "draw";
  if ((a === "strike" && b === "control") || (a === "control" && b === "defense") || (a === "defense" && b === "strike")) return "win";
  return "lose";
}

function buildOrder(energyPool = 10) {
  const shuffled = [...CARDS].sort(() => Math.random() - 0.5);
  const picks = [];
  let used = 0;
  for (const c of shuffled) {
    if (picks.length >= 5) break;
    if (used + c.energyCost <= energyPool) { picks.push(c); used += c.energyCost; }
  }
  // fill remaining ignoring budget
  for (const c of shuffled) {
    if (picks.length >= 5) break;
    if (!picks.find(p => p.id === c.id)) picks.push(c);
  }
  return picks;
}

function simulateMatch() {
  let aWins = 0, bWins = 0, round = 0;
  while (aWins < 2 && bWins < 2 && round < 5) {
    round++;
    const orderA = buildOrder(10);
    const orderB = buildOrder(10);
    let knockA = 0, knockB = 0;
    for (let i = 0; i < 5; i++) {
      const ca = orderA[i], cb = orderB[i];
      const adv = typeAdv(ca.type, cb.type);
      if (adv === "win")  { knockA += ca.knock; knockB += Math.floor(cb.knock * 0.3); }
      else if (adv === "lose") { knockB += cb.knock; knockA += Math.floor(ca.knock * 0.3); }
      else {
        knockA += Math.floor(ca.knock * 0.5);
        knockB += Math.floor(cb.knock * 0.5);
      }
    }
    if (knockA > knockB) aWins++;
    else if (knockB > knockA) bWins++;
  }
  return aWins >= 2 ? "A" : bWins >= 2 ? "B" : "A"; // A wins ties
}

// ── Payout via app API ───────────────────────────────────────────────────────

async function requestPayout(winnerAddress, matchId) {
  const url = `${APP_URL}/api/payout`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winner: winnerAddress, matchId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Payout failed");
  return data.txHash;
}

// ── Pre-flight balance check ─────────────────────────────────────────────────

async function checkBalances() {
  const [balA, balB, balT] = await Promise.all([
    getBalance(agentA.address),
    getBalance(agentB.address),
    getBalance(TREASURY_ADDR),
  ]);
  console.log(`📊  Pre-flight balances (cUSD):`);
  console.log(`    Agent A:  ${formatUnits(balA, 18)}`);
  console.log(`    Agent B:  ${formatUnits(balB, 18)}`);
  console.log(`    Treasury: ${formatUnits(balT, 18)}\n`);

  const needed = WAGER * BigInt(NUM_MATCHES);
  const payoutNeeded = PAYOUT * BigInt(NUM_MATCHES); // worst case all wins go to one agent

  if (balA < needed) {
    console.warn(`⚠️   Agent A needs at least ${formatUnits(needed, 18)} cUSD (has ${formatUnits(balA, 18)})`);
    console.warn(`    Send cUSD to ${agentA.address} on Celo mainnet to fund Agent A.`);
  }
  if (balB < needed) {
    console.warn(`⚠️   Agent B needs at least ${formatUnits(needed, 18)} cUSD (has ${formatUnits(balB, 18)})`);
    console.warn(`    Send cUSD to ${agentB.address} on Celo mainnet to fund Agent B.`);
  }
  if (balT < payoutNeeded) {
    console.warn(`⚠️   Treasury needs at least ${formatUnits(payoutNeeded, 18)} cUSD for payouts. Fund ${TREASURY_ADDR}`);
  }

  const ready = balA >= WAGER && balB >= WAGER && balT >= PAYOUT;
  if (!ready) {
    console.error("❌  Insufficient balances. Please fund the wallets above then re-run.");
    process.exit(1);
  }
  console.log("✅  Balances OK — starting matches!\n");
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function runMatch(n) {
  const matchId = `KO-BOT-${Date.now().toString(36).toUpperCase()}-${n}`;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎮  Match ${n}/${NUM_MATCHES}  [${matchId}]`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const walletA = walletFor(AGENT_A_KEY);
  const walletB = walletFor(AGENT_B_KEY);

  // Both agents wager 0.1 cUSD to treasury
  console.log(`  🥊  Wagers entering treasury...`);
  await transferCUSD(walletA, TREASURY_ADDR, WAGER, `Agent A wager (${matchId})`);
  await transferCUSD(walletB, TREASURY_ADDR, WAGER, `Agent B wager (${matchId})`);

  // Simulate game
  const winner = simulateMatch();
  const winnerAddr = winner === "A" ? agentA.address : agentB.address;
  console.log(`  🏆  Winner: Agent ${winner} (${winnerAddr})`);

  // Request payout from app server
  console.log(`  💰  Requesting payout from ${APP_URL}/api/payout ...`);
  try {
    const payoutTx = await requestPayout(winnerAddr, matchId);
    console.log(`  ✅  Payout tx: ${payoutTx}`);
  } catch (err) {
    console.error(`  ⚠️   Payout failed: ${err.message}`);
    console.error(`      (Wagers are in treasury — payout can be retried manually)`);
  }
}

async function main() {
  await checkBalances();

  for (let i = 1; i <= NUM_MATCHES; i++) {
    await runMatch(i);
    if (i < NUM_MATCHES) {
      console.log(`\n⏳  Waiting ${DELAY_SEC}s before next match...`);
      await new Promise(r => setTimeout(r, DELAY_SEC * 1000));
    }
  }

  console.log(`\n🏁  All ${NUM_MATCHES} matches complete!`);

  // Final balances
  const [balA, balB, balT] = await Promise.all([
    getBalance(agentA.address),
    getBalance(agentB.address),
    getBalance(TREASURY_ADDR),
  ]);
  console.log(`\n📊  Final balances (cUSD):`);
  console.log(`    Agent A:  ${formatUnits(balA, 18)}`);
  console.log(`    Agent B:  ${formatUnits(balB, 18)}`);
  console.log(`    Treasury: ${formatUnits(balT, 18)}`);
  console.log(`\n🔗  View transactions on Celo Explorer:`);
  console.log(`    Agent A: https://celoscan.io/address/${agentA.address}`);
  console.log(`    Agent B: https://celoscan.io/address/${agentB.address}`);
  console.log(`    Treasury: https://celoscan.io/address/${TREASURY_ADDR}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
