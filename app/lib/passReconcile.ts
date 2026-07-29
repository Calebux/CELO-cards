import { createPublicClient, http, decodeEventLog } from "viem";
import { celo } from "viem/chains";
import { redis } from "./redis";
import { SEASON_PLANS, type SeasonPlan } from "./seasonPassPlans";

// M-02 reconciliation: rebuild season-pass entitlements from on-chain
// PassPurchased events so a paid pass is recoverable if Redis state is lost.
// Reconstructs expiry with the SAME stacking rule the credit path uses
// (app/api/season-pass/route.ts): expiry = max(purchaseTime, prevExpiry) + planDays.

const BLOCKSCOUT = "https://celo.blockscout.com/api/v2";

const PASS_EVENT_ABI = [
  {
    name: "PassPurchased",
    type: "event",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "plan", type: "string" },
      { name: "amount", type: "uint256" },
      { name: "totalSold", type: "uint256" },
    ],
  },
] as const;

const publicClient = createPublicClient({
  chain: celo,
  transport: http(
    process.env.CELO_RPC_URL ?? process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ?? "https://forno.celo.org"
  ),
});

type BlockscoutLog = {
  data: `0x${string}`;
  topics: `0x${string}`[];
  block_number: number | string;
  transaction_hash: string;
};

function registries(): string[] {
  return [
    process.env.NEXT_PUBLIC_GDOLLAR_SEASON_PASS_CONTRACT,
    process.env.NEXT_PUBLIC_SEASON_PASS_CONTRACT, // legacy CELO registry, if configured
  ]
    .filter((a): a is string => !!a && a !== "0x0000000000000000000000000000000000000000")
    .map((a) => a.toLowerCase());
}

async function fetchLogs(address: string): Promise<BlockscoutLog[]> {
  let url: string | null = `${BLOCKSCOUT}/addresses/${address}/logs`;
  const out: BlockscoutLog[] = [];
  for (let i = 0; url && i < 50; i++) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Blockscout ${r.status} for ${address}`);
    const j = (await r.json()) as { items?: BlockscoutLog[]; next_page_params?: Record<string, string> | null };
    out.push(...(j.items ?? []));
    if (j.next_page_params) {
      url = `${BLOCKSCOUT}/addresses/${address}/logs?${new URLSearchParams(j.next_page_params)}`;
    } else {
      url = null;
    }
  }
  return out;
}

export type ReconcileSummary = {
  purchases: number;
  buyers: number;
  active: number;
  expired: number;
  missingFromRedis: string[];
  restored: number;
};

export async function reconcilePasses(opts?: { apply?: boolean }): Promise<ReconcileSummary> {
  const apply = opts?.apply ?? false;

  const purchases: { buyer: string; plan: SeasonPlan; block: number; txHash: string }[] = [];
  for (const reg of registries()) {
    for (const lg of await fetchLogs(reg)) {
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: PASS_EVENT_ABI,
          data: lg.data,
          topics: lg.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
        });
      } catch {
        continue;
      }
      if (decoded.eventName !== "PassPurchased") continue;
      const plan = String(decoded.args.plan);
      if (!(plan in SEASON_PLANS)) continue;
      purchases.push({
        buyer: decoded.args.buyer.toLowerCase(),
        plan: plan as SeasonPlan,
        block: Number(lg.block_number),
        txHash: lg.transaction_hash,
      });
    }
  }

  // Block timestamps (cached per block)
  const blockTs = new Map<number, number>();
  for (const b of new Set(purchases.map((p) => p.block))) {
    const blk = await publicClient.getBlock({ blockNumber: BigInt(b) });
    blockTs.set(b, Number(blk.timestamp) * 1000);
  }

  // Reconstruct per-buyer entitlement with the credit path's stacking rule
  const byBuyer = new Map<string, { expiry: number; plan: SeasonPlan; txHash: string }>();
  for (const p of purchases.sort((a, b) => a.block - b.block)) {
    const t = blockTs.get(p.block) ?? Date.now();
    const prev = byBuyer.get(p.buyer);
    const base = prev ? Math.max(t, prev.expiry) : t;
    byBuyer.set(p.buyer, { expiry: base + SEASON_PLANS[p.plan].days * 86_400_000, plan: p.plan, txHash: p.txHash });
  }

  const now = Date.now();
  let active = 0;
  let expired = 0;
  let restored = 0;
  const missingFromRedis: string[] = [];

  for (const [buyer, rec] of byBuyer) {
    if (rec.expiry <= now) {
      expired++;
      continue;
    }
    active++;
    const key = `season-pass:${buyer}`;
    const existing = await redis.get(key);
    if (!existing) {
      missingFromRedis.push(buyer);
      if (apply) {
        const ttl = Math.ceil((rec.expiry - now) / 1000);
        await redis.set(key, { expiry: rec.expiry, plan: rec.plan, txHash: rec.txHash }, { ex: ttl });
        restored++;
      }
    }
  }

  return { purchases: purchases.length, buyers: byBuyer.size, active, expired, missingFromRedis, restored };
}
