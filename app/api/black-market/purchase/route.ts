import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseUnits, parseAbiItem } from "viem";
import { celo } from "viem/chains";
import { CARDS } from "../../../lib/gameData";
import { recordBlackMarketPurchaseActivity } from "../../../lib/opsActivity";
import { sanitizePlayerName } from "../../../lib/rateLimit";
import { redis } from "../../../lib/redis";
import {
  TREASURY_ADDRESS,
  TREASURY_MINIPAY_ADDRESS,
  USDT_CONTRACT,
  USDC_CONTRACT,
  CUSD_CONTRACT,
} from "../../../lib/cusd";
import { GDOLLAR_CONTRACT } from "../../../lib/gooddollar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

// Server-authoritative record of premium cards a wallet has paid for.
function ownedPremiumKey(address: string) {
  return `owned-premium:${address.toLowerCase()}`;
}

// Mirror the client's point→on-chain conversions (app/(app)/black-market/page.tsx)
// exactly so a legitimate payment always verifies.
function ptsToStable(pts: number, decimals: number): bigint {
  return parseUnits((pts / 1000 * 0.08).toFixed(6) as `${number}`, decimals);
}
function ptsToGdollar(pts: number): bigint {
  return parseUnits((pts * 0.08).toFixed(6) as `${number}`, 18);
}
function ptsToCelo(pts: number): bigint {
  return parseUnits((pts / 1000).toFixed(6) as `${number}`, 18);
}

const STABLE_TOKENS = {
  usdt: { address: USDT_CONTRACT, decimals: 6 },
  usdc: { address: USDC_CONTRACT, decimals: 6 },
  cusd: { address: CUSD_CONTRACT, decimals: 18 },
} as const;

export async function POST(req: NextRequest) {
  let body: {
    address?: string;
    playerName?: string | null;
    cardId?: string;
    currency?: "celo" | "gdollar" | "usdt" | "usdc" | "cusd";
    pricePoints?: number;
    txHash?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const buyer = address as `0x${string}`;
  if (!body.cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  const card = CARDS.find((item) => item.id === body.cardId);
  if (!card || !card.isPremium) {
    return NextResponse.json({ error: "Unknown card" }, { status: 400 });
  }
  const currency = body.currency;
  if (currency !== "celo" && currency !== "gdollar" && currency !== "usdt" && currency !== "usdc" && currency !== "cusd") {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }
  if (!body.txHash || typeof body.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) {
    return NextResponse.json({ error: "Valid txHash required" }, { status: 400 });
  }
  const txHash = body.txHash as `0x${string}`;

  // Price is the card's authoritative price, never the caller-supplied value.
  const pricePoints = card.price ?? 3000;

  // ── Atomically claim the transaction before crediting (dedup + replay-safe)
  const txKey = `black-market-tx:${txHash}`;
  const reserved = await redis.set(txKey, "1", { nx: true });
  if (!reserved) {
    // Already processed. Idempotent if this wallet already owns the card.
    const owned = await redis.smembers(ownedPremiumKey(buyer));
    if (owned.includes(card.id)) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  // ── Verify the on-chain payment ───────────────────────────────────────────
  const verified = await verifyPayment(currency, txHash, buyer, pricePoints).catch(() => false);
  if (!verified) {
    // Release the claim so a legitimate retry (e.g. tx not yet mined) can succeed.
    await redis.del(txKey).catch(() => {});
    return NextResponse.json({ error: "Payment not verified", pending: true }, { status: 402 });
  }

  // ── Grant ownership (authoritative) + record telemetry ────────────────────
  await redis.sadd(ownedPremiumKey(buyer), card.id);
  await recordBlackMarketPurchaseActivity({
    address,
    playerName: sanitizePlayerName(body.playerName),
    cardId: card.id,
    cardName: card.name,
    currency,
    pricePoints,
    txHash,
    purchasedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}

async function verifyPayment(
  currency: "celo" | "gdollar" | "usdt" | "usdc" | "cusd",
  txHash: `0x${string}`,
  buyer: `0x${string}`,
  pricePoints: number,
): Promise<boolean> {
  // The client POSTs right after submitting, so the tx may not be mined yet —
  // wait briefly for the receipt (Celo blocks are ~1s).
  const receipt = await publicClient
    .waitForTransactionReceipt({ hash: txHash, timeout: 8000, confirmations: 1 })
    .catch(() => null);
  if (!receipt || receipt.status !== "success") return false;

  // Native CELO — direct value transfer from buyer to treasury.
  if (currency === "celo") {
    const tx = await publicClient.getTransaction({ hash: txHash }).catch(() => null);
    if (!tx) return false;
    return (
      tx.from?.toLowerCase() === buyer.toLowerCase() &&
      tx.to?.toLowerCase() === TREASURY_ADDRESS.toLowerCase() &&
      tx.value >= ptsToCelo(pricePoints)
    );
  }

  // ERC-20 transfer from buyer to the matching treasury, >= price.
  const isGdollar = currency === "gdollar";
  const token = isGdollar ? GDOLLAR_CONTRACT : STABLE_TOKENS[currency].address;
  const treasury = isGdollar ? TREASURY_ADDRESS : TREASURY_MINIPAY_ADDRESS;
  const minAmount = isGdollar
    ? ptsToGdollar(pricePoints)
    : ptsToStable(pricePoints, STABLE_TOKENS[currency].decimals);

  const logs = await publicClient.getLogs({
    address: token,
    event: transferEvent,
    args: { from: buyer, to: treasury },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  }).catch(() => []);

  return logs.some(
    (l) =>
      l.transactionHash?.toLowerCase() === txHash.toLowerCase() &&
      BigInt((l.args as { value?: bigint }).value ?? 0n) >= minAmount,
  );
}
