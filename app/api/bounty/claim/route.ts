import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis } from "../../../lib/redis";
import { checkRateLimit } from "../../../lib/rateLimit";
import { GDOLLAR_CONTRACT } from "../../../lib/gooddollar";
import { buildBountyClaimAuthMessage, verifyTreasuryActionSignature } from "../../../lib/treasuryAuth";
import {
  BOUNTY_PARTICIPATION_POOL_USD,
  BOUNTY_POOL_USD,
  bountyDayUTC,
  getBountyDayResult,
  isBountyDayClosed,
  usdToGdollar,
} from "../../../lib/bounty";

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

  let body: { address?: string; day?: string; signature?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const day = body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
    ? body.day
    : bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000);

  // A day still in progress can still change places. Paying it early would let
  // someone claim first place and then be overtaken.
  if (!isBountyDayClosed(day)) {
    return NextResponse.json({ error: "That day hasn't finished yet. Claims open at 00:00 UTC." }, { status: 409 });
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

  const amountGdollar = usdToGdollar(mine.totalUsd);
  if (amountGdollar <= 0 || amountGdollar > MAX_DAY_PAYOUT_GDOLLAR) {
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
    const spentAfter = await redis.incrby(daySpendKey(day), amountGdollar);
    if (spentAfter === amountGdollar) {
      await redis.expire(daySpendKey(day), 365 * 24 * 60 * 60);
    }
    if (spentAfter > MAX_DAY_PAYOUT_GDOLLAR) {
      await redis.incrby(daySpendKey(day), -amountGdollar);
      await redis.del(claimKey(day, address));
      return NextResponse.json({ error: "This day's payout budget is exhausted." }, { status: 409 });
    }

    const key = process.env.TREASURY_PRIVATE_KEY;
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
    const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
    const walletClient = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });

    const value = parseUnits(String(amountGdollar), 18);

    // Check funds first so a shortfall reports honestly instead of failing as an
    // opaque revert after the player has already been told it worked.
    const balance = await publicClient.readContract({
      address: GDOLLAR_CONTRACT,
      abi: ERC20_TRANSFER_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (balance < value) {
      await redis.incrby(daySpendKey(day), -amountGdollar).catch(() => {});
      await redis.del(claimKey(day, address));
      return NextResponse.json(
        { error: "The prize pot is topping up — please try again shortly." },
        { status: 503 },
      );
    }

    const { request } = await publicClient.simulateContract({
      account,
      address: GDOLLAR_CONTRACT,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [address as `0x${string}`, value],
    });
    const txHash = await walletClient.writeContract(request);
    broadcastTx = txHash;

    await redis.set(claimKey(day, address), { txHash, amountGdollar, usd: mine.totalUsd, at: Date.now() }, { ex: CLAIM_RECORD_TTL_SECONDS });

    return NextResponse.json({ ok: true, txHash, amountGdollar, usd: mine.totalUsd });
  } catch (e) {
    if (broadcastTx) {
      // The transfer is already on-chain. Releasing the slot here — which is
      // what a blanket delete used to do if the bookkeeping write failed —
      // would let the same player claim again and be paid twice. Record what we
      // know instead, and never free the slot.
      await redis
        .set(claimKey(day, address), { txHash: broadcastTx, amountGdollar, usd: mine.totalUsd, at: Date.now() }, { ex: CLAIM_RECORD_TTL_SECONDS })
        .catch(() => {});
      return NextResponse.json({ ok: true, txHash: broadcastTx, amountGdollar, usd: mine.totalUsd });
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
    : bountyDayUTC(Date.now() - 24 * 60 * 60 * 1000);

  const [standings, claimed] = await Promise.all([
    getBountyDayResult(day),
    redis.get<{ txHash?: string }>(claimKey(day, address)).catch(() => null),
  ]);
  const mine = standings.find((s) => s.address.toLowerCase() === address);

  return NextResponse.json({
    day,
    closed: isBountyDayClosed(day),
    usd: mine?.totalUsd ?? 0,
    amountGdollar: mine?.totalUsd ? usdToGdollar(mine.totalUsd) : 0,
    rank: mine?.rank ?? null,
    alreadyClaimed: !!claimed?.txHash,
    txHash: claimed?.txHash ?? null,
  });
}
