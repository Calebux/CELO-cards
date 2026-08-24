// GoodDollar season-pass payment — kept OUT of the main bundle on purpose.
//
// MiniPay requires that GoodDollar not appear or operate anywhere in the Mini
// App. G$ is already not a payment option there and no G$ code path runs, but
// importing the registry ABI and contract addresses at module level still
// shipped them in the shared chunk. Everything G$-shaped therefore lives here
// and is reached only through `await import("./seasonPassGdollar")` from the
// web-only branches, so the module becomes its own chunk that a MiniPay session
// never downloads.
//
// This is a boundary, not a rewrite: crediting the purchase afterwards
// (pollAndRegister) deliberately stays in the component, single-copy. Splitting
// the payment branches is safe; splitting the code that turns a payment into an
// entitlement is how someone pays and gets nothing.

import type { PublicClient } from "viem";
import { GDOLLAR_CONTRACT, GDOLLAR_ABI } from "./gooddollar";
import { GDOLLAR_SEASON_PASS_CONTRACT, GDOLLAR_SEASON_PASS_ABI } from "./gdollarSeasonPassContract";

export type GdollarPlanId = "weekly" | "monthly" | "season";

/** On-chain price getter per plan — the registry is the pricing authority (H-04). */
const PRICE_GETTER = {
  weekly: "weeklyPrice",
  monthly: "monthlyPrice",
  season: "seasonPrice",
} as const;

export const GDOLLAR_SEASON_PASS_ACTIVE =
  GDOLLAR_SEASON_PASS_CONTRACT !== "0x0000000000000000000000000000000000000000";

type WriteContract = (args: {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  account: `0x${string}`;
  chainId: number;
}) => Promise<`0x${string}`>;

/** Live prices for all three plans. Falls back to the caller's config on failure. */
export async function readGdollarPrices(
  client: PublicClient,
): Promise<Partial<Record<GdollarPlanId, bigint>>> {
  if (!GDOLLAR_SEASON_PASS_ACTIVE) return {};
  const [weekly, monthly, season] = await Promise.all(
    ([PRICE_GETTER.weekly, PRICE_GETTER.monthly, PRICE_GETTER.season] as const).map((fn) =>
      client.readContract({
        address: GDOLLAR_SEASON_PASS_CONTRACT,
        abi: GDOLLAR_SEASON_PASS_ABI,
        functionName: fn,
      }),
    ),
  );
  return { weekly, monthly, season } as Partial<Record<GdollarPlanId, bigint>>;
}

/** The buyer's G$ balance, for telling "no funds" apart from "no gas". */
export async function readGdollarBalance(
  client: PublicClient,
  address: `0x${string}`,
): Promise<bigint> {
  return (await client.readContract({
    address: GDOLLAR_CONTRACT,
    abi: GDOLLAR_ABI,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;
}

/**
 * Buy a season pass with G$, from the buyer's own wallet so the purchase is
 * attributable on-chain.
 *
 * Reads the authoritative price at purchase time and approves exactly that,
 * rather than a stale config price the registry owner may have changed (H-04).
 * Returns the purchase tx hash; the caller credits the entitlement.
 */
export async function purchaseWithGdollar(opts: {
  client: PublicClient;
  writeContractAsync: WriteContract;
  account: `0x${string}`;
  chainId: number;
  planId: GdollarPlanId;
  /** Used only when no registry is deployed — a direct transfer to treasury. */
  fallbackPriceWei: bigint;
  treasury: `0x${string}`;
  onPrice?: (planId: GdollarPlanId, price: bigint) => void;
}): Promise<`0x${string}`> {
  const { client, writeContractAsync, account, chainId, planId } = opts;

  if (!GDOLLAR_SEASON_PASS_ACTIVE) {
    return writeContractAsync({
      address: GDOLLAR_CONTRACT,
      abi: GDOLLAR_ABI,
      functionName: "transfer",
      args: [opts.treasury, opts.fallbackPriceWei],
      account,
      chainId,
    });
  }

  const livePrice = (await client.readContract({
    address: GDOLLAR_SEASON_PASS_CONTRACT,
    abi: GDOLLAR_SEASON_PASS_ABI,
    functionName: PRICE_GETTER[planId],
  })) as bigint;
  opts.onPrice?.(planId, livePrice);

  await writeContractAsync({
    address: GDOLLAR_CONTRACT,
    abi: GDOLLAR_ABI,
    functionName: "approve",
    args: [GDOLLAR_SEASON_PASS_CONTRACT, livePrice],
    account,
    chainId,
  });

  return writeContractAsync({
    address: GDOLLAR_SEASON_PASS_CONTRACT,
    abi: GDOLLAR_SEASON_PASS_ABI,
    functionName: "buySeasonPass",
    args: [planId],
    account,
    chainId,
  });
}
