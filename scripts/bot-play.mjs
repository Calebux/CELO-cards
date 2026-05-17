/**
 * bot-play.mjs
 * 1. Sets usernames for all 110 bot wallets
 * 2. Buys weekly season passes (0.5 CELO each → treasury, on-chain)
 * 3. Plays exactly 2 games per wallet (110 matches total across 2 rounds)
 *
 * Run: node --env-file=.env.local scripts/bot-play.mjs [BASE_URL]
 */

import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, toHex, padHex } from "viem";
import { celo } from "viem/chains";
import { randomBytes } from "node:crypto";

const BASE_URL = (process.argv[2] || process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522";
const SEASON_PASS_PRICE = parseEther("0.5");

// SeasonPassRegistry contract — each bot wallet calls this directly so the tx
// is FROM their wallet and shows on Celoscan / Talent Protocol.
const SEASON_PASS_CONTRACT = (process.env.NEXT_PUBLIC_SEASON_PASS_CONTRACT ?? "0x0000000000000000000000000000000000000000");
const CONTRACT_ACTIVE = SEASON_PASS_CONTRACT !== "0x0000000000000000000000000000000000000000";
const SEASON_PASS_ABI = [
  {
    name: "buySeasonPass",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "plan", type: "string" }],
    outputs: [],
  },
];

// KnockOrderArena wager contract — each bot wallet calls enterMatchWithCelo()
// so the tx is FROM their wallet with real CELO value → Talent Protocol DAU.
const WAGER_CONTRACT = "0x80B10A44B0Ea03473707660Bc5767099710bBFE0";
const ENTRY_FEE = 7_000_000_000_000n; // 0.000007 CELO
const WAGER_ABI = [
  {
    name: "enterMatchWithCelo",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
];

const CHARACTERS = ["kaira", "kenji", "riven", "zane", "elara"];

const FREE_CARDS = [
  "phantom_break", "storm_kick", "power_punch", "direct_impact", "finisher",
  "guard_stance", "reversal_edge", "anticipation", "mind_game", "evasion",
  "pressure_advance", "disrupt", "berserk_surge", "run_away", "inner_focus",
  "javelin_dive", "aerial_spear_fist",
];

const BOT_USERNAMES = [
  // 1-22
  "ShadowFist","IronGuard","StormKick","CrystalEdge","VoidStrike",
  "NightBlade","ThunderPaw","SilverClaw","FrostBite","EmberStrike",
  "DuskRaven","GaleRush","StoneBreak","CoralFang","AshKnock",
  "NeonCrash","WildThorn","BlazePunch","FrostKick","IronFang",
  "VortexSlam","PhantomBlow",
  // 23-86
  "CrimsonEdge","ViperStrike","BoulderFist","LightningKick","MidnightClaw",
  "SolarPunch","GlacierSlam","TornadoFang","ObsidianBlade","CinderGuard",
  "TwilightRush","CobraStrike","ThunderBreak","QuickSilver","FlameDash",
  "IcePiercer","NovaBurst","RiftSlasher","StormRider","MarbleGuard",
  "VenomEdge","SerpentKick","RadiantFist","AuroraStrike","BlazeRaven",
  "TempestClaw","GraniteSmash","WillowDance","CrystalBlow","InfernoFang",
  "ZephyrKick","DarkMatter","HazelPunch","SteelEcho","RubyGuard",
  "PearlStrike","CobaltFist","AmberRush","OpalEdge","JadeBreak",
  "SapphireClaw","EbonyBlade","CoralKick","IvoryFang","MalachitePaw",
  "GarnetSlam","TurquoiseRush","OnyxPunch","CrimsonRaven","GoldFist",
  "SilverEdge","BronzeKick","IronClaw","SteelBlade","CopperStrike",
  "TitanGuard","AquaFang","ScarlettDash","MarigoldKick","ZirconFist",
  "SpinelEdge","PlatinumRush","DiamondKick","MoonstoneBlow",
  // 87-110
  "NetherClaw","HexStrike","FluxPunch","EmberRush","SteelThorn",
  "ChaosKick","ForgeGuard","DawnBlade","QuasarFist","PrismaticEdge",
  "VoidRaven","CosmicKnock","AstralDash","SolarGuard","BrimstoneKick",
  "TwilightFang","GlacierEdge","VolcanoPunch","StormForge","CrimsonTide",
  "IronDusk","SerpentGuard","MidnightRush","BladeHorizon",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function randomMatchId() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function pickRandom(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

const publicClient = createPublicClient({ chain: celo, transport: http() });

// ── 1. Load wallets ──────────────────────────────────────────────────────────

function loadWallets() {
  const wallets = [];
  for (let i = 1; i <= 110; i++) {
    const key = process.env[`BOT_WALLET_${i}_KEY`];
    if (!key) { console.error(`❌ Missing BOT_WALLET_${i}_KEY`); process.exit(1); }
    const account = privateKeyToAccount(/** @type {`0x${string}`} */ (key));
    wallets.push({ key, account, index: i, username: BOT_USERNAMES[i - 1] });
  }
  return wallets;
}

// ── 2. Fund wallets from treasury ────────────────────────────────────────────

async function fundWallets(wallets) {
  const TARGET = parseEther("0.60");
  const PASS_THRESHOLD = parseEther("0.55"); // needs a new pass — must have this much
  const GAS_THRESHOLD = parseEther("0.06");  // already has pass — needs gas for 2 recordMatch txs
  const treasury = privateKeyToAccount(/** @type {`0x${string}`} */ (process.env.TREASURY_PRIVATE_KEY));
  const walletClient = createWalletClient({ account: treasury, chain: celo, transport: http() });

  const treasuryBal = await publicClient.getBalance({ address: treasury.address });
  console.log(`\n💰 Treasury balance: ${(Number(treasuryBal) / 1e18).toFixed(4)} CELO`);

  // Check pass status and balance in parallel
  const [passStatuses, balances] = await Promise.all([
    Promise.all(wallets.map(w =>
      fetch(`${BASE_URL}/api/season-pass?address=${w.account.address.toLowerCase()}`)
        .then(r => r.json()).catch(() => ({ active: false }))
    )),
    Promise.all(wallets.map(w => publicClient.getBalance({ address: w.account.address }))),
  ]);

  const needed = [];
  for (let i = 0; i < wallets.length; i++) {
    const hasPass = passStatuses[i].active;
    const bal = balances[i];
    const min = hasPass ? GAS_THRESHOLD : PASS_THRESHOLD;
    if (bal < min) needed.push({ wallet: wallets[i], topup: TARGET - bal });
  }

  if (needed.length === 0) { console.log("  ✓ All wallets sufficiently funded"); return; }

  const totalTopup = needed.reduce((s, { topup }) => s + topup, 0n);
  console.log(`  ${needed.length} wallets need funding — total: ${(Number(totalTopup) / 1e18).toFixed(4)} CELO`);
  if (treasuryBal < totalTopup) {
    console.log(`  ⚠️  Treasury has ${(Number(treasuryBal) / 1e18).toFixed(4)} CELO but needs ${(Number(totalTopup) / 1e18).toFixed(4)} CELO`);
    console.log(`  ⚠️  Please top up the treasury: ${treasury.address}`);
    console.log(`  ℹ️  Continuing — bots without enough CELO will skip season pass purchase`);
    return;
  }

  console.log(`\n💸 Funding ${needed.length} wallets from treasury...`);
  let nonce = await publicClient.getTransactionCount({ address: treasury.address });
  for (const { wallet, topup } of needed) {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const txHash = await walletClient.sendTransaction({ to: wallet.account.address, value: topup, nonce });
        await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
        console.log(`  ✅ Bot ${wallet.index}: +${(Number(topup) / 1e18).toFixed(4)} CELO`);
        nonce++;
        break;
      } catch (err) {
        attempts++;
        const msg = String(err.message);
        if (msg.includes("nonce too low") || msg.includes("already known")) {
          console.log(`  ✅ Bot ${wallet.index}: tx confirmed`);
          nonce++;
          break;
        }
        if (attempts < 3) {
          console.log(`  ⚠️ Bot ${wallet.index}: retry ${attempts}/3`);
          await sleep(3000);
        } else {
          console.log(`  ❌ Bot ${wallet.index}: failed — ${msg.slice(0, 60)}`);
          nonce++;
        }
      }
    }
  }
}

// ── 3. Set usernames ─────────────────────────────────────────────────────────

async function setUsernames(wallets) {
  console.log("\n👤 Setting usernames...");
  for (const w of wallets) {
    try {
      const existing = await api("GET", `/api/username?address=${w.account.address.toLowerCase()}`);
      if (existing.username) { process.stdout.write(`  ✓ Bot ${w.index}: "${existing.username}"  `); continue; }
      await api("POST", "/api/username", { address: w.account.address, username: w.username });
      process.stdout.write(`  ✓ Bot ${w.index}: set "${w.username}"  `);
    } catch (err) {
      process.stdout.write(`  ⚠️ Bot ${w.index}: ${err.message.slice(0, 40)}  `);
    }
    await sleep(100);
  }
  console.log("\n");
}

// ── 4. Buy season passes ──────────────────────────────────────────────────────

async function buySeasonPasses(wallets) {
  console.log(`🎫 Buying weekly season passes via ${CONTRACT_ACTIVE ? "contract" : "direct transfer"}...`);
  for (const w of wallets) {
    try {
      const status = await api("GET", `/api/season-pass?address=${w.account.address.toLowerCase()}`);
      if (status.active) {
        process.stdout.write(`  ✓ Bot ${w.index}: active  `);
        continue;
      }
      const balance = await publicClient.getBalance({ address: w.account.address });
      if (balance < SEASON_PASS_PRICE) {
        process.stdout.write(`  ⚠️ Bot ${w.index}: low CELO  `);
        continue;
      }
      const wc = createWalletClient({ account: w.account, chain: celo, transport: http() });
      let txHash;
      if (CONTRACT_ACTIVE) {
        // Use sendTransaction to bypass viem's pre-flight balance check
        const data = encodeFunctionData({
          abi: SEASON_PASS_ABI,
          functionName: "buySeasonPass",
          args: ["weekly"],
        });
        const fees = await publicClient.estimateFeesPerGas();
        txHash = await wc.sendTransaction({
          to: /** @type {`0x${string}`} */ (SEASON_PASS_CONTRACT),
          data,
          value: SEASON_PASS_PRICE,
          gas: 200_000n,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        });
      } else {
        txHash = await wc.sendTransaction({ to: /** @type {`0x${string}`} */ (TREASURY), value: SEASON_PASS_PRICE });
      }
      await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
      await api("POST", "/api/season-pass", { address: w.account.address, txHash, plan: "weekly", currency: "celo" });
      process.stdout.write(`  ✅ Bot ${w.index}  `);
    } catch (err) {
      process.stdout.write(`  ❌ Bot ${w.index}: ${err.message.slice(0, 40)}  `);
    }
    await sleep(500);
  }
  console.log("\n");
}

// ── 5. Register ranked entries (sequential to avoid treasury nonce collisions) ─

async function registerAllEntries(matches) {
  console.log("  📋 Registering ranked entries...");
  for (const m of matches) {
    for (const role of ["host", "joiner"]) {
      const wallet = role === "host" ? m.hostW : m.joinerW;
      try {
        const r = await api("POST", "/api/season-pass/enter", {
          address: wallet.account.address, matchId: m.matchId, role,
        });
        process.stdout.write(`  [#${m.matchNum}] ${role} entry ✅  `);
        if (role === "host") m.hostEntryTx = r.txHash;
        else m.joinerEntryTx = r.txHash;
      } catch {
        process.stdout.write(`  [#${m.matchNum}] ${role} ⚠️  `);
      }
      await sleep(200); // brief pause so RPC nonce refreshes
    }
  }
  console.log("\n");
}

// ── 6. Enter match on-chain — each wallet sends 0.000007 CELO to wager contract ─

async function enterMatchOnChain(wallet, matchId) {
  const matchIdBytes32 = padHex(toHex(matchId), { size: 32 });
  const fees = await publicClient.estimateFeesPerGas();
  const data = encodeFunctionData({ abi: WAGER_ABI, functionName: "enterMatchWithCelo", args: [matchIdBytes32] });
  const wc = createWalletClient({ account: wallet.account, chain: celo, transport: http() });
  const txHash = await wc.sendTransaction({
    to: /** @type {`0x${string}`} */ (WAGER_CONTRACT),
    data,
    value: ENTRY_FEE,
    gas: 100_000n,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
  return txHash;
}

// ── 7. Play a single match ────────────────────────────────────────────────────

async function playMatch(matchId, hostW, joinerW, matchNum) {
  const hostChar   = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  const joinerChar = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];

  console.log(`[#${matchNum}] ${matchId}  ${hostW.username} vs ${joinerW.username}`);

  // Enter match on-chain — both wallets send 0.000007 CELO to wager contract
  const [hr, jr] = await Promise.allSettled([
    enterMatchOnChain(hostW, matchId),
    enterMatchOnChain(joinerW, matchId),
  ]);
  const hostTx   = hr.status === "fulfilled" ? hr.value?.slice(0, 12) : "❌";
  const joinerTx = jr.status === "fulfilled" ? jr.value?.slice(0, 12) : "❌";
  console.log(`  [#${matchNum}] ⛓  host=${hostTx} joiner=${joinerTx}`);

  // Character select
  await api("POST", `/api/match/${matchId}`, {
    role: "host", characterId: hostChar, playerName: hostW.username, address: hostW.account.address,
  });
  await sleep(400);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api("POST", `/api/match/${matchId}`, {
        role: "joiner", characterId: joinerChar, playerName: joinerW.username, address: joinerW.account.address,
      });
      break;
    } catch (err) {
      if (attempt < 2 && String(err.message).includes("410")) await sleep(1000);
      else throw err;
    }
  }
  await sleep(400);

  // Play rounds
  let round = 1, hostWins = 0, joinerWins = 0;
  while (hostWins < 3 && joinerWins < 3) {
    await api("PATCH", `/api/match/${matchId}`, {
      role: "host", cardIds: pickRandom(FREE_CARDS, 5), round, attunedCardIds: [],
    });
    await sleep(300);
    await api("PATCH", `/api/match/${matchId}`, {
      role: "joiner", cardIds: pickRandom(FREE_CARDS, 5), round, attunedCardIds: [],
    });

    let state = null;
    for (let i = 0; i < 15; i++) {
      await sleep(700);
      state = await api("GET", `/api/match/${matchId}?role=host`);
      if (state.phase === "resolved" && state.slots) break;
    }
    if (!state?.slots) { console.log(`  [#${matchNum}] R${round} unresolved — abort`); break; }

    hostWins   = state.hostWins   ?? hostWins;
    joinerWins = state.opponentWins ?? joinerWins;
    console.log(`  [#${matchNum}] R${round}: ${hostW.username} ${hostWins}–${joinerWins} ${joinerW.username}`);
    round++;
    await sleep(400);
  }

  const winner = hostWins >= 3 ? hostW.username : joinerW.username;
  console.log(`  [#${matchNum}] ✓ ${winner} wins\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const wallets = loadWallets();
  console.log(`🤖 ${wallets.length} bot wallets → ${BASE_URL}`);

  await fundWallets(wallets);
  await setUsernames(wallets);
  await buySeasonPasses(wallets);

  // Each wallet plays exactly 2 games:
  // Round 1: pair wallets 0-1, 2-3, ..., 108-109 → 55 matches
  // Round 2: rotate — wallet[0] vs wallet[109], wallet[1] vs wallet[108], ..., wallet[54] vs wallet[55] → 55 matches
  const round1 = [];
  for (let i = 0; i < 110; i += 2) {
    round1.push({ matchId: randomMatchId(), hostW: wallets[i], joinerW: wallets[i + 1], matchNum: i / 2 + 1 });
  }

  // Rotate: wallet[0] vs wallet[109], wallet[1] vs wallet[108], etc.
  const round2 = [];
  for (let i = 0; i < 55; i++) {
    round2.push({ matchId: randomMatchId(), hostW: wallets[i], joinerW: wallets[109 - i], matchNum: 55 + i + 1 });
  }

  for (const [roundNum, matches] of [[1, round1], [2, round2]]) {
    console.log(`\n══════ Round ${roundNum} — ${matches.length} matches ══════\n`);

    // Create match rooms sequentially
    for (const { matchId, hostW, joinerW } of matches) {
      await api("PATCH", `/api/match/${matchId}`, {
        role: "host", action: "keepalive", mode: "ranked",
        playerName: hostW.username, address: hostW.account.address,
      }).catch(() => {});
      await api("PATCH", `/api/match/${matchId}`, {
        role: "joiner", action: "keepalive", mode: "ranked",
        playerName: joinerW.username, address: joinerW.account.address,
      }).catch(() => {});
    }

    // Register entries sequentially
    await registerAllEntries(matches);

    // Play all matches concurrently (staggered 300ms)
    await Promise.all(
      matches.map(({ matchId, hostW, joinerW, matchNum }, idx) =>
        sleep(idx * 300).then(() =>
          playMatch(matchId, hostW, joinerW, matchNum).catch((err) =>
            console.error(`  [#${matchNum}] ❌ ${err.message}`)
          )
        )
      )
    );

    console.log(`\n✅ Round ${roundNum} done — ${matches.length} games complete`);
    await sleep(3000);
  }

  console.log("\n🏆 All done — each of 110 wallets played exactly 2 games (110 total matches)");
}

main().catch(console.error);
