import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import { redis } from "../../../lib/redis";
import { IDENTITY_CONTRACT, IDENTITY_ABI, GDOLLAR_CONTRACT, GDOLLAR_ABI } from "../../../lib/gooddollar";
import {
  agentAddresses,
  welcomePlayer,
  grantGas,
  welcomeKey,
  gasGrantKey,
  welcomeSpendToday,
  welcomeRpcClient,
  WELCOME_AMOUNT,
  WELCOME_GAS_AMOUNT,
  MIN_TREASURY_CELO,
} from "../../../lib/welcomeBonus";
import { privateKeyToAccount } from "viem/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/welcome-sweep — pay every verified player who was missed.
 *
 * The client-side ping cannot be relied on. Verifying sends the player out to
 * GoodDollar and back, and 42% of session resumes fail, so they frequently
 * return with no wallet connected and the ping never fires. It is also one
 * shot per page load with no retry. The result was that /api/welcome-bonus paid
 * nobody at all for 26 days while ~220 people verified.
 *
 * This asks the chain instead of waiting to be told. It walks our own players,
 * finds the ones GoodDollar has whitelisted, and pays whoever has not been paid
 * — which is what puts them on the chain inside the 24-hour window that the
 * GoodBuilders onboarding metric counts.
 *
 * Deliberately incremental. It keeps a cursor, does a bounded amount of work per
 * run and stops early rather than overrunning, so the schedule decides coverage
 * and one slow run never wedges the next.
 */

/**
 * Only pay people whose verification is recent enough to still count.
 *
 * The onboarding metric joins a WhitelistedAdded event to an interaction within
 * 24 HOURS of it. Paying someone who verified last week creates a real transfer
 * that earns nothing on the metric — and there are 338 such people, which is
 * 33,800 G$ against a treasury holding 11,936. So the sweep deliberately
 * targets only the window it can still influence, and the backlog stays a
 * separate, explicit spending decision rather than something a cron does
 * quietly. Set WELCOME_MAX_AGE_HOURS=0 to lift the filter and pay everyone.
 */
const MAX_AGE_HOURS = Number(process.env.WELCOME_MAX_AGE_HOURS ?? 20);

/**
 * What the sweep sends. "gas" by default, and not to save money — at 200 gwei a
 * G$ transfer burns 0.0458 CELO against 0.0042 for a bare transfer, so the
 * treasury's CELO is what actually runs out, long before its G$ does. A gas
 * grant records the player for a tenth of that and leaves them able to sign
 * their own transactions, which is the thing that was blocking them.
 * Set WELCOME_SWEEP_MODE=gdollar to send the 100 G$ bonus instead.
 */
const MODE = process.env.WELCOME_SWEEP_MODE === "gdollar" ? "gdollar" : "gas";

const SCAN_BUDGET = 1_500;          // wallets classified per run
const PAY_BUDGET = 40;              // transfers per run — the slow part
const TIME_BUDGET_MS = 240_000;     // stop before the platform does
const CURSOR_KEY = "welcome:sweep-cursor";
const CHECKED_KEY = "welcome:sweep-paid";  // wallets we know are settled

function unauthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured = refuse rather than run open
  const auth = req.headers.get("authorization") ?? "";
  return auth !== `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (unauthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Shipping this must not start spending on its own. Someone turns it on.
  if (process.env.WELCOME_SWEEP_ENABLED !== "true") {
    return NextResponse.json({ skipped: "WELCOME_SWEEP_ENABLED is not true" });
  }

  const startedAt = Date.now();
  const budget = await welcomeSpendToday();
  if (budget.remaining <= 0) {
    return NextResponse.json({ ok: true, stopped: "day cap reached", ...budget });
  }

  // Refuse to start rather than churn. Every failed transfer still costs an
  // identity read, a reservation and a rollback, and a treasury that cannot pay
  // is an operational problem to report, not something to retry every 30 min.
  const payClient = welcomeRpcClient();
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey) return NextResponse.json({ error: "Treasury not configured" }, { status: 503 });
  const treasury = privateKeyToAccount(
    (treasuryKey.startsWith("0x") ? treasuryKey : `0x${treasuryKey}`) as `0x${string}`,
  );
  const [treasuryGdollar, treasuryCelo] = await Promise.all([
    payClient.readContract({
      address: GDOLLAR_CONTRACT,
      abi: GDOLLAR_ABI,
      functionName: "balanceOf",
      args: [treasury.address],
    }),
    payClient.getBalance({ address: treasury.address }),
  ]);

  // CELO is checked whichever mode is running, because CELO is what pays for
  // the transaction itself. Only checking the G$ balance was how this could
  // report "119 bonuses available" while holding gas for eight of them.
  const gasPrice = await payClient.getGasPrice();
  const perTxGas = gasPrice * (MODE === "gdollar" ? 229_000n : 21_000n);
  const spendPerPlayer = MODE === "gdollar" ? perTxGas : perTxGas + WELCOME_GAS_AMOUNT;
  const celoHeadroom = treasuryCelo > MIN_TREASURY_CELO ? treasuryCelo - MIN_TREASURY_CELO : 0n;
  const affordableByCelo = spendPerPlayer > 0n ? Number(celoHeadroom / spendPerPlayer) : 0;
  const affordableByToken = MODE === "gdollar" ? Number(treasuryGdollar / WELCOME_AMOUNT) : Infinity;
  const affordable = Math.min(affordableByCelo, affordableByToken);

  if (affordable < 1) {
    return NextResponse.json({
      ok: false,
      stopped: "treasury cannot fund another payment",
      mode: MODE,
      treasury: treasury.address,
      celo: treasuryCelo.toString(),
      gdollar: treasuryGdollar.toString(),
      limitedBy: affordableByCelo < affordableByToken ? "celo" : "gdollar",
    });
  }

  const identityClient = createPublicClient({
    chain: celo,
    transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ?? "https://forno.celo.org"),
  });
  const agents = agentAddresses();

  // Walk user:addr:* from where the last run stopped. SCAN's cursor is exactly
  // the right tool: it never misses a key that is present throughout, and it
  // costs nothing to resume.
  let cursor = (await redis.get<string>(CURSOR_KEY)) ?? "0";
  const candidates: string[] = [];
  let wrapped = false;

  while (candidates.length < SCAN_BUDGET && Date.now() - startedAt < TIME_BUDGET_MS) {
    const [next, keys] = await redis.scan(cursor, { match: "user:addr:*", count: 500 });
    cursor = next;
    for (const k of keys) {
      const addr = k.slice("user:addr:".length).toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr) || agents.has(addr)) continue;
      candidates.push(addr);
    }
    if (cursor === "0") { wrapped = true; break; }
  }
  await redis.set(CURSOR_KEY, cursor);

  // Drop wallets a previous run already settled. This is the cheap filter that
  // keeps each run mostly to wallets whose status might actually have changed.
  let fresh = candidates;
  if (candidates.length) {
    const seen = await redis.smembers(CHECKED_KEY).catch(() => [] as string[]);
    const settled = new Set(seen.map((s) => s.toLowerCase()));
    fresh = candidates.filter((a) => !settled.has(a));
  }

  // Who is verified right now. Chunked so a wide multicall never trips the
  // RPC's request ceiling, and allowFailure so one bad read is not a dead run.
  const verified: string[] = [];
  let readFailures = 0;
  for (let i = 0; i < fresh.length; i += 60) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const chunk = fresh.slice(i, i + 60);
    const res = await identityClient.multicall({
      contracts: chunk.map((a) => ({
        address: IDENTITY_CONTRACT,
        abi: IDENTITY_ABI,
        functionName: "getWhitelistedRoot",
        args: [a as `0x${string}`],
      })),
      allowFailure: true,
    });
    res.forEach((r, j) => {
      if (r.status !== "success") { readFailures++; return; }
      // multicall types the result across every function in the ABI, so narrow
      // on the shape we actually asked for rather than asserting it.
      const root = r.result;
      if (typeof root === "string" && root !== "0x0000000000000000000000000000000000000000") {
        verified.push(chunk[j]);
      }
    });
  }

  // Skip anyone whose identity root is already recorded, so the run spends its
  // transfer budget on people who still need paying rather than on lookups.
  const unpaid: string[] = [];
  for (let i = 0; i < verified.length; i += 100) {
    const chunk = verified.slice(i, i + 100);
    const keyFor = MODE === "gdollar" ? welcomeKey : gasGrantKey;
    const existing = await redis.mget<number>(...chunk.map((a) => keyFor(a)));
    chunk.forEach((a, j) => { if (!existing[j]) unpaid.push(a); });
  }

  // Keep only the people the 24h window can still count. Read against the
  // identity root, which is where the authentication timestamp lives.
  let eligible = unpaid;
  let tooOld = 0;
  if (MAX_AGE_HOURS > 0 && unpaid.length) {
    const cutoff = BigInt(Math.floor((Date.now() - MAX_AGE_HOURS * 3_600_000) / 1000));
    const recent: string[] = [];
    for (let i = 0; i < unpaid.length; i += 60) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const chunk = unpaid.slice(i, i + 60);
      const res = await identityClient.multicall({
        contracts: chunk.map((a) => ({
          address: IDENTITY_CONTRACT,
          abi: IDENTITY_ABI,
          functionName: "lastAuthenticated",
          args: [a as `0x${string}`],
        })),
        allowFailure: true,
      });
      res.forEach((r, j) => {
        if (r.status !== "success") { readFailures++; return; }
        const last = r.result;
        if (typeof last === "bigint" && last >= cutoff) recent.push(chunk[j]);
        else tooOld++;
      });
    }
    eligible = recent;
  }

  const results = { sent: 0, alreadySent: 0, notVerified: 0, failed: 0, capped: 0 };
  const txHashes: string[] = [];
  const settledNow: string[] = [];

  for (const addr of eligible) {
    if (results.sent >= PAY_BUDGET) break;
    if (results.sent >= affordable) break;
    if (results.sent >= budget.remaining) { results.capped++; break; }
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const r = MODE === "gdollar"
      ? await welcomePlayer(payClient, addr)
      : await grantGas(payClient, addr);
    switch (r.status) {
      case "sent":         results.sent++; txHashes.push(r.txHash); settledNow.push(addr); break;
      case "already-sent": results.alreadySent++; settledNow.push(addr); break;
      case "not-verified": results.notVerified++; break;
      case "day-cap-reached": results.capped++; break;
      default:             results.failed++; break;
    }
  }

  // Only wallets that are genuinely settled are remembered, so a failed
  // transfer is retried on the next run instead of being skipped forever.
  if (settledNow.length) await redis.sadd(CHECKED_KEY, ...settledNow).catch(() => {});

  return NextResponse.json({
    ok: true,
    mode: MODE,
    scanned: candidates.length,
    afterSettledFilter: fresh.length,
    verified: verified.length,
    unpaid: unpaid.length,
    eligibleInWindow: eligible.length,
    skippedTooOldToCount: tooOld,
    maxAgeHours: MAX_AGE_HOURS,
    treasuryCanAfford: affordable,
    limitedBy: affordableByCelo < affordableByToken ? "celo" : "gdollar",
    ...results,
    txHashes,
    readFailures,
    cursor,
    completedFullPass: wrapped,
    durationMs: Date.now() - startedAt,
    dayCap: await welcomeSpendToday(),
  });
}
