import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { celo } from "viem/chains";
import { redis } from "../../lib/redis";
import { GDOLLAR_CONTRACT } from "../../lib/gooddollar";
import { TREASURY_ADDRESS, TREASURY_MINIPAY_ADDRESS, CUSD_CONTRACT, USDC_CONTRACT } from "../../lib/cusd";
import { SEASON_PASS_CONTRACT, SEASON_PASS_ABI } from "../../lib/seasonPassContract";
import { GDOLLAR_SEASON_PASS_CONTRACT, GDOLLAR_SEASON_PASS_ABI } from "../../lib/gdollarSeasonPassContract";
import { SEASON_PLANS, type SeasonPlan } from "../../lib/seasonPassPlans";

const TREASURY = TREASURY_ADDRESS;
const TREASURY_MINIPAY = TREASURY_MINIPAY_ADDRESS;
const USDT_CONTRACT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`;
// MiniPay stablecoins accepted for pass purchases. Prices are stored in the
// 6-decimal priceUsdt field; scale up for 18-decimal USDm (cusd).
const STABLE_TOKENS = {
  usdt: { address: USDT_CONTRACT, decimals: 6, symbol: "USDT" },
  usdc: { address: USDC_CONTRACT, decimals: 6, symbol: "USDC" },
  cusd: { address: CUSD_CONTRACT, decimals: 18, symbol: "USDm" },
} as const;
const CONTRACT_ACTIVE = SEASON_PASS_CONTRACT !== "0x0000000000000000000000000000000000000000";
const GDOLLAR_CONTRACT_ACTIVE = GDOLLAR_SEASON_PASS_CONTRACT !== "0x0000000000000000000000000000000000000000";
export const dynamic = "force-dynamic";

const publicClient = createPublicClient({
  chain: celo,
  transport: http("https://celo-mainnet.g.alchemy.com/v2/5TkObpGZSAQ-ntN5ZFswA"),
});

type SeasonPassRecord = { expiry: number; plan: SeasonPlan; txHash?: string };

function passKey(address: string) {
  return `season-pass:${address.toLowerCase()}`;
}

function parseSeasonPassRecord(value: unknown): SeasonPassRecord | null {
  if (!value) return null;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Partial<SeasonPassRecord>;
      const expiry = Number(parsed.expiry);
      if (Number.isFinite(expiry) && typeof parsed.plan === "string" && parsed.plan in SEASON_PLANS) {
        return {
          expiry,
          plan: parsed.plan as SeasonPlan,
          txHash: typeof parsed.txHash === "string" ? parsed.txHash : undefined,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (typeof value === "object") {
    const parsed = value as Partial<SeasonPassRecord>;
    const expiry = Number(parsed.expiry);
    if (Number.isFinite(expiry) && typeof parsed.plan === "string" && parsed.plan in SEASON_PLANS) {
      return {
        expiry,
        plan: parsed.plan as SeasonPlan,
        txHash: typeof parsed.txHash === "string" ? parsed.txHash : undefined,
      };
    }
  }

  return null;
}

function freeGamesKey(address: string) {
  return `free-games:${address.toLowerCase()}`;
}

async function getFreeGamesLeft(address: string): Promise<number> {
  const used = Number(await redis.get(freeGamesKey(address))) || 0;
  return Math.max(0, 2 - used);
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

  const data = parseSeasonPassRecord(await redis.get(passKey(address)));
  const freeGamesLeft = await getFreeGamesLeft(address);

  if (!data) return NextResponse.json({ active: false, expiry: null, plan: null, freeGamesLeft });

  const { expiry, plan } = data;
  if (expiry < Date.now()) {
    await redis.del(passKey(address));
    return NextResponse.json({ active: false, expiry: null, plan: null, freeGamesLeft });
  }

  return NextResponse.json({ active: true, expiry, plan, freeGamesLeft });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { address?: string; txHash?: string; plan?: SeasonPlan; currency?: "celo" | "gdollar" | "usdt" | "usdc" | "cusd" };
  const { address, txHash, plan, currency = "celo" } = body;

  if (!address || !txHash || !plan || !SEASON_PLANS[plan]) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const buyer = address as `0x${string}`;

  // Transaction dedup is enforced atomically after verification via SET NX
  // (see below) so concurrent requests can't double-credit.
  const txKey = `season-pass-tx:${txHash}`;

  const planConfig = SEASON_PLANS[plan];
  // The plan we actually credit. For contract purchases this is overridden with
  // the plan emitted on-chain, so a cheap purchase cannot be claimed as an
  // expensive plan (H-01). Direct-transfer paths are bound by the amount check
  // below, so the requested plan is safe there.
  let creditedPlan: SeasonPlan = plan;

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

  const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

  if (currency === "usdt" || currency === "usdc" || currency === "cusd") {
    // Verify stablecoin ERC-20 Transfer event → TREASURY_MINIPAY (Safe contract)
    const token = STABLE_TOKENS[currency];
    const minAmount = BigInt(planConfig.priceUsdt) * 10n ** BigInt(token.decimals - 6);
    if (tx.to?.toLowerCase() !== token.address.toLowerCase()) {
      return NextResponse.json({ error: "Invalid transaction recipient" }, { status: 403 });
    }
    let stableLogs;
    try {
      stableLogs = await publicClient.getLogs({
        address: token.address,
        event: transferEvent,
        // Bind the payment to the buyer (H-02): only a transfer FROM the
        // crediting wallet TO the treasury can activate their pass.
        args: { from: buyer, to: TREASURY_MINIPAY },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });
    } catch {
      // RPC failure — treat as pending so the client keeps polling
      return NextResponse.json({ pending: true }, { status: 404 });
    }
    const matchingLog = stableLogs.find(
      (l) => l.transactionHash?.toLowerCase() === txHash.toLowerCase() &&
             BigInt((l.args as { value?: bigint }).value ?? 0n) >= minAmount
    );
    if (!matchingLog) {
      return NextResponse.json({ error: `${token.symbol} transfer to treasury not found or insufficient` }, { status: 403 });
    }
  } else if (currency === "gdollar") {
    // G$ verification — contract path (new) or direct transfer (legacy)
    const isGdollarContractTx = GDOLLAR_CONTRACT_ACTIVE &&
      tx.to?.toLowerCase() === GDOLLAR_SEASON_PASS_CONTRACT.toLowerCase();
    const isGdollarDirectTx = tx.to?.toLowerCase() === GDOLLAR_CONTRACT.toLowerCase();

    if (!isGdollarContractTx && !isGdollarDirectTx) {
      return NextResponse.json({ error: "Invalid transaction recipient" }, { status: 403 });
    }

    if (isGdollarContractTx) {
      // Verify PassPurchased event was emitted for this buyer
      const logs = await publicClient.getContractEvents({
        address: GDOLLAR_SEASON_PASS_CONTRACT,
        abi: GDOLLAR_SEASON_PASS_ABI,
        eventName: "PassPurchased",
        args: { buyer },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      }).catch(() => []);
      const matchingLog = logs.find(
        l => l.transactionHash?.toLowerCase() === txHash.toLowerCase()
      );
      if (!matchingLog) {
        return NextResponse.json({ error: "PassPurchased event not found for buyer" }, { status: 403 });
      }
      // Credit the plan the contract actually charged for, not the request.
      const eventPlan = matchingLog.args.plan;
      if (!eventPlan || !(eventPlan in SEASON_PLANS)) {
        return NextResponse.json({ error: "Unrecognized plan in purchase event" }, { status: 403 });
      }
      creditedPlan = eventPlan as SeasonPlan;
    } else {
      // Legacy direct transfer — verify ERC-20 Transfer event: G$ contract → Treasury
      let gdollarLogs;
      try {
        gdollarLogs = await publicClient.getLogs({
          address: GDOLLAR_CONTRACT,
          event: transferEvent,
          // Bind the payment to the buyer (H-02).
          args: { from: buyer, to: TREASURY },
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber,
        });
      } catch {
        return NextResponse.json({ pending: true }, { status: 404 });
      }
      const matchingLog = gdollarLogs.find(
        (l) => l.transactionHash?.toLowerCase() === txHash.toLowerCase() &&
               BigInt((l.args as { value?: bigint }).value ?? 0n) >= BigInt(planConfig.priceGdollar)
      );
      if (!matchingLog) {
        return NextResponse.json({ error: "G$ transfer to treasury not found or insufficient" }, { status: 403 });
      }
    }
  } else {
    // Native CELO verification — contract path (new) or direct transfer (legacy)
    const isContractTx = CONTRACT_ACTIVE &&
      tx.to?.toLowerCase() === SEASON_PASS_CONTRACT.toLowerCase();
    const isDirectTx = tx.to?.toLowerCase() === TREASURY.toLowerCase();

    if (!isContractTx && !isDirectTx) {
      return NextResponse.json({ error: "Invalid transaction recipient" }, { status: 403 });
    }

    if (isContractTx) {
      // Verify PassPurchased event was emitted for this buyer
      const logs = await publicClient.getContractEvents({
        address: SEASON_PASS_CONTRACT,
        abi: SEASON_PASS_ABI,
        eventName: "PassPurchased",
        args: { buyer },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      }).catch(() => []);
      const matchingLog = logs.find(
        l => l.transactionHash?.toLowerCase() === txHash.toLowerCase()
      );
      if (!matchingLog) {
        return NextResponse.json({ error: "PassPurchased event not found for buyer" }, { status: 403 });
      }
      // Credit the plan the contract actually charged for, not the request.
      const eventPlan = matchingLog.args.plan;
      if (!eventPlan || !(eventPlan in SEASON_PLANS)) {
        return NextResponse.json({ error: "Unrecognized plan in purchase event" }, { status: 403 });
      }
      creditedPlan = eventPlan as SeasonPlan;
    } else {
      // Legacy direct transfer — bind the payment to the buyer (H-02): the
      // native CELO transfer must originate from the crediting wallet.
      if (tx.from?.toLowerCase() !== buyer.toLowerCase()) {
        return NextResponse.json({ error: "Payment sender does not match buyer" }, { status: 403 });
      }
      if (tx.value < BigInt(planConfig.priceWei)) {
        return NextResponse.json({ error: "Insufficient payment amount" }, { status: 403 });
      }
    }
  }
  // Atomically claim this transaction before crediting so two concurrent
  // requests cannot both pass verification and stack the pass twice (H-03).
  // The record is permanent (no expiry) so a tx can never be replayed after
  // the pass lapses.
  const reserved = await redis.set(txKey, "1", { nx: true });
  if (!reserved) {
    // Already claimed. If it credited THIS buyer's current pass, respond
    // idempotently (the client may poll the same tx more than once); a
    // different wallet reusing the tx is rejected.
    const current = parseSeasonPassRecord(await redis.get(passKey(address)));
    if (current && current.txHash === txHash) {
      return NextResponse.json({ success: true, expiry: current.expiry, plan: current.plan });
    }
    return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
  }

  const durationMs = SEASON_PLANS[creditedPlan].days * 24 * 60 * 60 * 1000;

  // Stack on top of existing pass if still active
  const existing = parseSeasonPassRecord(await redis.get(passKey(address)));
  const baseExpiry = existing ? Math.max(Date.now(), existing.expiry) : Date.now();
  const expiry = baseExpiry + durationMs;

  const ttlSec = Math.ceil((expiry - Date.now()) / 1000) + 86400; // +1 day buffer
  await redis.set(passKey(address), { expiry, plan: creditedPlan, txHash }, { ex: ttlSec });

  return NextResponse.json({ success: true, expiry, plan: creditedPlan });
}
