import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis } from "../../../lib/redis";
import { checkRateLimit } from "../../../lib/rateLimit";
import { GDOLLAR_CONTRACT, fetchGoodDollarStatus } from "../../../lib/gooddollar";
import { USDT_CONTRACT } from "../../../lib/cusd";
import { buildBountyClaimAuthMessage, verifyTreasuryActionSignature } from "../../../lib/treasuryAuth";
import {
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  bountyDayUTC,
  bountyPausedOn,
  getBountyDayResult,
  isBountyDayClosed,
  usdToGdollar,
} from "../../../lib/bounty";
// Pure config helper, so it comes straight from the dependency-free module.
import { lastPayingDayAtOrBefore } from "../../../lib/bountyConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Identity is checked before the claim slot is reserved, so it needs its own
// client — the transfer builds one later, inside the payout path.
const identityClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });

const claimKey = (day: string, addr: string) => `bounty:claim:${day}:${addr}`;

// A claim record must outlive the standings it was paid against. Day snapshots
// keep for a year, so the reservation does too — at 7 days it could expire while
// the day was still claimable, and a crash between broadcasting the transfer and
// recording it would leave the slot free for a second payout.
const CLAIM_RECORD_TTL_SECONDS = 365 * 24 * 60 * 60;
const daySpendKey = (day: string) => `bounty:claim-spend:${day}`;

// Hard ceiling on what a single day can ever pay out, independent of anything
// read from Redis. C-02 removed treasury payments sized by Redis values for
// exactly this reason; the bounty needs the same backstop, so a corrupted or
// manipulated standings record still cannot drain the treasury.
const MAX_DAY_PAYOUT_GDOLLAR = usdToGdollar(BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD);

// The day ceiling is counted in whole CENTS, not token units, because a day can
// now be paid in either G$ or USDT and one budget has to cover both. A new key
// name on purpose: the old `bounty:claim-spend:` values are in G$ and mixing the
// two units in one counter would silently let a day pay out twice over.
const MAX_DAY_PAYOUT_CENTS = Math.round((BOUNTY_POOL_USD + BOUNTY_PARTICIPATION_POOL_USD) * 100);
const daySpendCentsKey = (day: string) => `bounty:claim-spend-cents:${day}`;

/**
 * What a prize is paid in.
 *
 * MiniPay players are paid USDT: GoodDollar must not operate anywhere in the
 * Mini App, so a G$ prize is not payable to them at all. USDT is denominated in
 * dollars like the prize itself, so there is no conversion rate in the path —
 * $5 is 5 USDT, exactly.
 */
const PAYOUT_TOKENS = {
  gdollar: { address: GDOLLAR_CONTRACT, decimals: 18, label: "G$" },
  usdt: { address: USDT_CONTRACT, decimals: 6, label: "USDT" },
} as const;
type PayoutCurrency = keyof typeof PAYOUT_TOKENS;

/**
 * POST /api/bounty/claim  { address, day, signature }
 *
 * Pays a winner their bounty from the treasury, in G$.
 *
 * Everything that decides the amount is server-side: the day's frozen
 * standings, not anything the caller sends. The caller only proves which wallet
 * they are.
 */
export async function POST(req: NextRequest) {
  if (!process.env.TREASURY_PRIVATE_KEY) {
    return NextResponse.json({ error: "Payouts are not configured." }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`bounty-claim:${ip}`, 10, 300))) {
    return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429 });
  }

  let body: { address?: string; day?: string; signature?: string; currency?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  // Defaults to the last day that actually paid, which is yesterday while the
  // bounty is running and the final pre-pause day while it is paused — a prize
  // that is still owed must stay reachable, not fall behind a moving default.
  const day = body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
    ? body.day
    : lastPayingDayAtOrBefore(bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000));

  // MiniPay players are paid USDT — a G$ prize cannot reach them at all, since
  // GoodDollar must not operate in the Mini App. The client asks for it; the
  // AMOUNT is still decided server-side from the frozen standings, so the worst
  // a forged flag can do is take the same dollar value from a different pot.
  const currency: PayoutCurrency = body.currency === "usdt" ? "usdt" : "gdollar";
  const token = PAYOUT_TOKENS[currency];

  // A day still in progress can still change places. Paying it early would let
  // someone claim first place and then be overtaken.
  if (!isBountyDayClosed(day)) {
    return NextResponse.json({ error: "That day hasn't finished yet. Claims open at 00:00 UTC." }, { status: 409 });
  }

  // Paused days pay nothing. Their standings already come back with zero money,
  // so this is defence in depth — but it is also the honest error to show, since
  // "nothing to claim for that day" would read as a bug to someone who topped a
  // paused board. Days before the pause are unaffected and stay claimable.
  if (bountyPausedOn(day)) {
    return NextResponse.json(
      {
        error: "The daily bounty is paused, so that day has no prize. Prizes you won before the pause are still claimable.",
        reason: "bounty-paused",
      },
      { status: 403 },
    );
  }

  // Proves the caller controls the wallet. Without this anyone could claim
  // another player's prize into their own wallet by passing their address.
  const message = buildBountyClaimAuthMessage(address, day);
  const signed = await verifyTreasuryActionSignature(address, body.signature ?? "", message);
  if (!signed) {
    return NextResponse.json({ error: "Signature required to claim." }, { status: 401 });
  }

  // Amount comes from the frozen day, never from the request.
  const standings = await getBountyDayResult(day);
  const mine = standings.find((s) => s.address.toLowerCase() === address);
  if (!mine || mine.totalUsd <= 0) {
    return NextResponse.json({ error: "Nothing to claim for that day." }, { status: 403 });
  }

  // Prize money leaves the treasury, so it goes only to a verified human. This
  // is the same sybil gate the House prize and daily reward already use: without
  // it, a day's standings can be farmed across throwaway wallets. Checked after
  // the standings lookup so someone with nothing to claim is told that, rather
  // than being sent to verify for a prize they did not win.
  //
  // Fails closed — an RPC failure must not pay out an unverified wallet — and
  // resolves through the identity root so a linked wallet counts as verified.
  //
  // Skipped entirely for USDT claims, and not as a convenience: reading the
  // GoodDollar identity contract IS GoodDollar functionality, so it cannot run
  // for a MiniPay player. What still bounds a USDT claim is the work itself —
  // 5,000 points in a day is roughly 25 Hard wins — plus the per-day ceiling
  // below. Weaker than a face check; deliberately so, and worth revisiting if
  // the pool ever grows.
  let identityStatus: Awaited<ReturnType<typeof fetchGoodDollarStatus>> | null = null;
  if (currency === "gdollar") {
    try {
      identityStatus = await fetchGoodDollarStatus(identityClient, address);
    } catch {
      return NextResponse.json({ error: "Could not check your verification. Please try again." }, { status: 503 });
    }
  }
  if (identityStatus && identityStatus.status !== "verified") {
    return NextResponse.json(
      {
        error:
          identityStatus.status === "expired"
            ? "Your G$ Verification has expired. Renew it to claim your winnings — your prize stays claimable."
            : "Claiming winnings needs a G$ Verified wallet. Verify once, then claim.",
        reason: identityStatus.status === "expired" ? "verification-expired" : "verification-required",
      },
      { status: 403 },
    );
  }

  const amountGdollar = usdToGdollar(mine.totalUsd);
  const amountCents = Math.round(mine.totalUsd * 100);
  // USDT is dollar-denominated, so the prize converts 1:1 with no rate involved.
  const amountTokens = currency === "usdt" ? mine.totalUsd : amountGdollar;
  if (
    amountCents <= 0 ||
    amountCents > MAX_DAY_PAYOUT_CENTS ||
    (currency === "gdollar" && (amountGdollar <= 0 || amountGdollar > MAX_DAY_PAYOUT_GDOLLAR))
  ) {
    return NextResponse.json({ error: "Payout amount failed its sanity check." }, { status: 409 });
  }

  // Claim the slot BEFORE sending. If two requests race, only one proceeds.
  const reserved = await redis.set(claimKey(day, address), "pending", { nx: true, ex: CLAIM_RECORD_TTL_SECONDS });
  if (!reserved) {
    const existing = await redis.get<{ txHash?: string }>(claimKey(day, address)).catch(() => null);
    return NextResponse.json(
      { error: "Already claimed", txHash: existing?.txHash ?? null },
      { status: 409 },
    );
  }

  // Set the moment the transfer is broadcast. After that point the slot must
  // never be released, whatever else fails — the money has already gone.
  let broadcastTx: `0x${string}` | null = null;

  try {
    // Per-day ceiling across ALL claimants, so even a bad standings record
    // cannot pay out more than one day's pools in total.
    //
    // Incremented first and rolled back if it overshoots: reading then writing
    // would let two simultaneous claims both see the old total and each believe
    // there was room, quietly taking the day over budget.
    const spentAfter = await redis.incrby(daySpendCentsKey(day), amountCents);
    if (spentAfter === amountCents) {
      await redis.expire(daySpendCentsKey(day), 365 * 24 * 60 * 60);
    }
    if (spentAfter > MAX_DAY_PAYOUT_CENTS) {
      await redis.incrby(daySpendCentsKey(day), -amountCents);
      await redis.del(claimKey(day, address));
      return NextResponse.json({ error: "This day's payout budget is exhausted." }, { status: 409 });
    }

    const key = process.env.TREASURY_PRIVATE_KEY;
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
    const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
    const walletClient = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });

    const value = parseUnits(String(amountTokens), token.decimals);

    // Check funds first so a shortfall reports honestly instead of failing as an
    // opaque revert after the player has already been told it worked.
    const balance = await publicClient.readContract({
      address: token.address,
      abi: ERC20_TRANSFER_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (balance < value) {
      await redis.incrby(daySpendCentsKey(day), -amountCents).catch(() => {});
      await redis.del(claimKey(day, address));
      return NextResponse.json(
        { error: "The prize pot is topping up — please try again shortly." },
        { status: 503 },
      );
    }

    const { request } = await publicClient.simulateContract({
      account,
      address: token.address,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [address as `0x${string}`, value],
    });
    const txHash = await walletClient.writeContract(request);
    broadcastTx = txHash;

    await redis.set(claimKey(day, address), { txHash, currency, amountTokens, amountGdollar, usd: mine.totalUsd, at: Date.now() }, { ex: CLAIM_RECORD_TTL_SECONDS });

    return NextResponse.json({ ok: true, txHash, currency, amountTokens, amountGdollar, usd: mine.totalUsd });
  } catch (e) {
    if (broadcastTx) {
      // The transfer is already on-chain. Releasing the slot here — which is
      // what a blanket delete used to do if the bookkeeping write failed —
      // would let the same player claim again and be paid twice. Record what we
      // know instead, and never free the slot.
      await redis
        .set(claimKey(day, address), { txHash: broadcastTx, currency, amountTokens, amountGdollar, usd: mine.totalUsd, at: Date.now() }, { ex: CLAIM_RECORD_TTL_SECONDS })
        .catch(() => {});
      return NextResponse.json({ ok: true, txHash: broadcastTx, currency, amountTokens, amountGdollar, usd: mine.totalUsd });
    }
    // Nothing was sent, so give back the reservation and the budget.
    await redis.incrby(daySpendKey(day), -amountGdollar).catch(() => {});
    await redis.del(claimKey(day, address)).catch(() => {});
    const message = e instanceof Error ? e.message : "Payout failed";
    return NextResponse.json({ error: message.slice(0, 140) }, { status: 500 });
  }
}

/** GET /api/bounty/claim?address=&day= → what this wallet can claim. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const requested = req.nextUrl.searchParams.get("day");
  const day = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? requested
    : lastPayingDayAtOrBefore(bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000));

  const [standings, claimed] = await Promise.all([
    getBountyDayResult(day),
    redis.get<{ txHash?: string }>(claimKey(day, address)).catch(() => null),
  ]);
  const mine = standings.find((s) => s.address.toLowerCase() === address);

  return NextResponse.json({
    day,
    closed: isBountyDayClosed(day),
    paused: bountyPausedOn(day),
    usd: mine?.totalUsd ?? 0,
    amountGdollar: mine?.totalUsd ? usdToGdollar(mine.totalUsd) : 0,
    amountUsdt: mine?.totalUsd ?? 0,
    rank: mine?.rank ?? null,
    alreadyClaimed: !!claimed?.txHash,
    txHash: claimed?.txHash ?? null,
  });
}
