import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { celo } from "viem/chains";
import { redis } from "../../lib/redis";
import { GDOLLAR_CONTRACT } from "../../lib/gooddollar";

const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as `0x${string}`;

const publicClient = createPublicClient({ chain: celo, transport: http() });

// G$ has 18 decimals on Celo
export const SEASON_PLANS = {
  weekly:  { days: 7,  priceWei: "500000000000000000",    priceCelo: "0.5",  priceGdollar: "1000000000000000000000",  priceGdollarDisplay: "1000",  label: "7 Days"  },
  monthly: { days: 30, priceWei: "1500000000000000000",   priceCelo: "1.5",  priceGdollar: "3000000000000000000000",  priceGdollarDisplay: "3000",  label: "30 Days" },
  season:  { days: 90, priceWei: "3500000000000000000",   priceCelo: "3.5",  priceGdollar: "7000000000000000000000",  priceGdollarDisplay: "7000",  label: "90 Days" },
} as const;

export type SeasonPlan = keyof typeof SEASON_PLANS;

function passKey(address: string) {
  return `season-pass:${address.toLowerCase()}`;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

  const data = await redis.get<{ expiry: number; plan: SeasonPlan }>(passKey(address));
  if (!data) return NextResponse.json({ active: false, expiry: null, plan: null });

  const { expiry, plan } = data;
  if (expiry < Date.now()) {
    await redis.del(passKey(address));
    return NextResponse.json({ active: false, expiry: null, plan: null });
  }

  return NextResponse.json({ active: true, expiry, plan });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { address?: string; txHash?: string; plan?: SeasonPlan; currency?: "celo" | "gdollar" };
  const { address, txHash, plan, currency = "celo" } = body;

  if (!address || !txHash || !plan || !SEASON_PLANS[plan]) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Idempotency — don't double-credit same tx
  const txKey = `season-pass-tx:${txHash}`;
  const seen = await redis.get(txKey);
  if (seen) return NextResponse.json({ error: "Transaction already used" }, { status: 409 });

  const planConfig = SEASON_PLANS[plan];

  // ── On-chain TX verification ──────────────────────────────────────────────
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: txHash as `0x${string}` }).catch(() => null),
    publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null),
  ]);
  if (!tx || !receipt) {
    return NextResponse.json({ pending: true }, { status: 404 });
  }
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 403 });
  }

  if (currency === "gdollar") {
    // Verify ERC-20 Transfer event: G$ contract → Treasury
    if (tx.to?.toLowerCase() !== GDOLLAR_CONTRACT.toLowerCase()) {
      return NextResponse.json({ error: "Invalid transaction recipient" }, { status: 403 });
    }
    const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
    const logs = await publicClient.getLogs({
      address: GDOLLAR_CONTRACT,
      event: transferEvent,
      args: { to: TREASURY },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    }).catch(() => []);
    const matchingLog = logs.find(
      (l) => l.transactionHash?.toLowerCase() === txHash.toLowerCase() &&
             BigInt((l.args as { value?: bigint }).value ?? 0n) >= BigInt(planConfig.priceGdollar)
    );
    if (!matchingLog) {
      return NextResponse.json({ error: "G$ transfer to treasury not found or insufficient" }, { status: 403 });
    }
  } else {
    // Native CELO verification
    if (tx.to?.toLowerCase() !== TREASURY.toLowerCase()) {
      return NextResponse.json({ error: "Invalid transaction recipient" }, { status: 403 });
    }
    if (tx.value < BigInt(planConfig.priceWei)) {
      return NextResponse.json({ error: "Insufficient payment amount" }, { status: 403 });
    }
  }
  const durationMs = planConfig.days * 24 * 60 * 60 * 1000;

  // Stack on top of existing pass if still active
  const existing = await redis.get<{ expiry: number }>(passKey(address));
  const baseExpiry = existing ? Math.max(Date.now(), existing.expiry) : Date.now();
  const expiry = baseExpiry + durationMs;

  const ttlSec = Math.ceil((expiry - Date.now()) / 1000) + 86400; // +1 day buffer
  await redis.set(passKey(address), JSON.stringify({ expiry, plan, txHash }), { ex: ttlSec });
  await redis.set(txKey, "1", { ex: ttlSec });

  return NextResponse.json({ success: true, expiry, plan });
}
