import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { redis } from "../../../lib/redis";
import { checkRateLimit } from "../../../lib/rateLimit";
import { GDOLLAR_CONTRACT } from "../../../lib/gooddollar";
import { USDT_CONTRACT } from "../../../lib/cusd";
import { verifyTreasuryActionSignature } from "../../../lib/treasuryAuth";
import { getHouseWinnerRewardActivity } from "../../../lib/opsActivity";
import { usdToGdollar } from "../../../lib/bounty";
import {
  buildHouseClaimAuthMessage,
  claimableState,
  houseClaimKey,
  isVerifiedReward,
  HOUSE_CLAIM_TTL_SECONDS,
  HOUSE_SPEND_CENTS_KEY,
  MAX_POOL_PAYOUT_CENTS,
  REWARD_CENTS,
  REWARD_USD,
  type RewardRecordLike,
} from "../../../lib/houseReward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERC20_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
] as const;

// G$ must not appear anywhere in the MiniPay Mini App, so MiniPay wallets are
// paid in a stablecoin they already hold. Same split the bounty claim makes.
const PAYOUT_TOKENS = {
  gdollar: { address: GDOLLAR_CONTRACT, decimals: 18, label: "G$" },
  usdt: { address: USDT_CONTRACT, decimals: 6, label: "USDT" },
} as const;

type ClaimBody = { address?: string; signature?: string; isMiniPay?: boolean };

/** The caller's own reward record, preferring an approved one. */
async function rewardFor(address: string): Promise<RewardRecordLike | null> {
  const addr = address.toLowerCase();
  const mine = (await getHouseWinnerRewardActivity())
    .filter((r) => r.playerAddress?.toLowerCase() === addr)
    .sort((a, b) => (b.verifiedAt ?? 0) - (a.verifiedAt ?? 0));
  // Same precedence the board uses, so a player who won twice is judged on the
  // claim that was actually approved rather than the most recent one.
  return mine.find(isVerifiedReward) ?? mine[0] ?? null;
}

// GET /api/house-winner/claim?address=0x… → what the button should show.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const [record, claimed, spent] = await Promise.all([
    rewardFor(address),
    redis.get<{ txHash?: string }>(houseClaimKey(address)).catch(() => null),
    redis.get<number>(HOUSE_SPEND_CENTS_KEY).catch(() => 0),
  ]);
  const state = claimableState({
    record, alreadyClaimed: !!claimed, spentCents: Number(spent) || 0,
  });
  return NextResponse.json({
    ...state,
    rewardUsd: REWARD_USD,
    txHash: (claimed as { txHash?: string } | null)?.txHash ?? null,
  });
}

export async function POST(req: NextRequest) {
  let body: ClaimBody;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.trim().toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!(await checkRateLimit(`house-claim:${address}`, 5, 300))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });
  }

  // Proves the caller controls the wallet being paid. Without it anyone could
  // name a winner's address and redirect their prize.
  const signed = await verifyTreasuryActionSignature(
    address, body.signature ?? "", buildHouseClaimAuthMessage(address),
  );
  if (!signed) {
    return NextResponse.json({ error: "Signature required to claim." }, { status: 401 });
  }

  const [record, spentBefore] = await Promise.all([
    rewardFor(address),
    redis.get<number>(HOUSE_SPEND_CENTS_KEY).catch(() => 0),
  ]);
  const state = claimableState({
    record, alreadyClaimed: false, spentCents: Number(spentBefore) || 0,
  });
  if (!state.claimable) {
    const messages: Record<string, string> = {
      "no-win": "No House Boss win found for this wallet.",
      "pending-review": "Your win is still being verified. You'll be able to claim once it's confirmed.",
      "pool-empty": "The House Boss pool is fully claimed.",
      "already-claimed": "You've already claimed your House Boss prize.",
    };
    return NextResponse.json({ error: messages[state.reason], reason: state.reason }, { status: 409 });
  }

  // One claim per wallet, ever. Reserved before any money moves, so two
  // simultaneous requests cannot both pass the checks above and both pay.
  const reserved = await redis.set(houseClaimKey(address), "pending", {
    nx: true, ex: HOUSE_CLAIM_TTL_SECONDS,
  });
  if (!reserved) {
    const existing = await redis.get<{ txHash?: string }>(houseClaimKey(address)).catch(() => null);
    return NextResponse.json(
      { error: "You've already claimed your House Boss prize.", txHash: existing?.txHash ?? null },
      { status: 409 },
    );
  }

  // Set once the transfer is broadcast. Past that point the slot is never
  // released whatever else fails — the money has already left.
  let broadcastTx: `0x${string}` | null = null;

  try {
    // Incremented first and rolled back on overshoot: reading then writing
    // would let two claims both see the old total and each believe there was
    // room, taking the pool over budget.
    const spentAfter = await redis.incrby(HOUSE_SPEND_CENTS_KEY, REWARD_CENTS);
    if (spentAfter > MAX_POOL_PAYOUT_CENTS) {
      await redis.incrby(HOUSE_SPEND_CENTS_KEY, -REWARD_CENTS);
      await redis.del(houseClaimKey(address));
      return NextResponse.json({ error: "The House Boss pool is fully claimed." }, { status: 409 });
    }

    const key = process.env.TREASURY_PRIVATE_KEY;
    if (!key) {
      await redis.incrby(HOUSE_SPEND_CENTS_KEY, -REWARD_CENTS);
      await redis.del(houseClaimKey(address));
      return NextResponse.json({ error: "Payouts are temporarily unavailable." }, { status: 503 });
    }

    const currency: keyof typeof PAYOUT_TOKENS = body.isMiniPay === true ? "usdt" : "gdollar";
    const token = PAYOUT_TOKENS[currency];
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
    const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
    const walletClient = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });

    const amountTokens = currency === "usdt" ? REWARD_USD : usdToGdollar(REWARD_USD);
    const value = parseUnits(String(amountTokens), token.decimals);

    // Checked first so a shortfall reports honestly rather than failing as an
    // opaque revert after the player has been told it worked.
    const balance = await publicClient.readContract({
      address: token.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
    });
    if (balance < value) {
      await redis.incrby(HOUSE_SPEND_CENTS_KEY, -REWARD_CENTS).catch(() => {});
      await redis.del(houseClaimKey(address));
      return NextResponse.json(
        { error: "The prize pot is topping up — please try again shortly." },
        { status: 503 },
      );
    }

    const { request } = await publicClient.simulateContract({
      account, address: token.address, abi: ERC20_ABI,
      functionName: "transfer", args: [address as `0x${string}`, value],
    });
    const txHash = await walletClient.writeContract(request);
    broadcastTx = txHash;

    await redis.set(
      houseClaimKey(address),
      { txHash, currency, amountTokens, usd: REWARD_USD, at: Date.now() },
      { ex: HOUSE_CLAIM_TTL_SECONDS },
    );
    return NextResponse.json({ ok: true, txHash, currency, amountTokens, usd: REWARD_USD });
  } catch (e) {
    if (broadcastTx) {
      // Already on-chain. Releasing the slot would let the same wallet be paid
      // twice, so it stays taken and the tx is recorded best-effort.
      await redis
        .set(houseClaimKey(address), { txHash: broadcastTx, usd: REWARD_USD, at: Date.now() }, { ex: HOUSE_CLAIM_TTL_SECONDS })
        .catch(() => {});
      return NextResponse.json({ ok: true, txHash: broadcastTx, usd: REWARD_USD });
    }
    await redis.incrby(HOUSE_SPEND_CENTS_KEY, -REWARD_CENTS).catch(() => {});
    await redis.del(houseClaimKey(address)).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send your prize right now." },
      { status: 500 },
    );
  }
}
