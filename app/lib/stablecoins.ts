"use client";

// MiniPay-supported stablecoins on Celo mainnet.
// MiniPay guideline: adapt to the user's preferred stablecoin — the one
// with the highest balance. Addresses verified against docs.celo.org.
// USDm is the rebranded cUSD and keeps the original cUSD contract, so the
// internal currency key stays "cusd" for compatibility with stored matches.

import { useReadContracts } from "wagmi";
import { celo } from "wagmi/chains";
import { formatUnits } from "viem";
import { ERC20_ABI, CUSD_CONTRACT, USDT_CONTRACT, USDC_CONTRACT } from "./cusd";

export type MiniPayStableKey = "usdt" | "usdc" | "cusd";

export type MiniPayStablecoin = {
  key: MiniPayStableKey;
  symbol: string; // user-facing symbol
  address: `0x${string}`;
  decimals: number;
  color: string;
};

export const MINIPAY_STABLECOINS: readonly MiniPayStablecoin[] = [
  { key: "usdt", symbol: "USDT", address: USDT_CONTRACT, decimals: 6,  color: "#26a17b" },
  { key: "usdc", symbol: "USDC", address: USDC_CONTRACT, decimals: 6,  color: "#2775CA" },
  { key: "cusd", symbol: "USDm", address: CUSD_CONTRACT, decimals: 18, color: "#56a4cb" },
] as const;

export function getStablecoin(key: MiniPayStableKey): MiniPayStablecoin {
  return MINIPAY_STABLECOINS.find(s => s.key === key) ?? MINIPAY_STABLECOINS[0];
}

export function isMiniPayStableKey(key: unknown): key is MiniPayStableKey {
  return key === "usdt" || key === "usdc" || key === "cusd";
}

// Normalize a raw balance to 18 decimals so different-decimal coins compare 1:1.
function normalize(raw: bigint, decimals: number): bigint {
  return raw * 10n ** BigInt(18 - decimals);
}

export type MiniPayStablecoinState = {
  /** Highest-balance stablecoin; USDT until balances load or when all are zero. */
  preferred: MiniPayStablecoin;
  /** Raw on-chain balances keyed by currency key. */
  balances: Partial<Record<MiniPayStableKey, bigint>>;
  /** Preferred coin balance formatted for display (2 dp). */
  preferredDisplay: string;
  loaded: boolean;
};

export function useMiniPayStablecoin(address: `0x${string}` | undefined, enabled: boolean): MiniPayStablecoinState {
  const { data } = useReadContracts({
    contracts: MINIPAY_STABLECOINS.map(coin => ({
      address: coin.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId: celo.id,
    })),
    query: { enabled: !!address && enabled, refetchInterval: 30_000 },
  });

  const balances: Partial<Record<MiniPayStableKey, bigint>> = {};
  let preferred = MINIPAY_STABLECOINS[0];
  let best = -1n;
  let loaded = false;

  MINIPAY_STABLECOINS.forEach((coin, i) => {
    const result = data?.[i];
    if (result?.status !== "success" || typeof result.result !== "bigint") return;
    loaded = true;
    balances[coin.key] = result.result;
    const norm = normalize(result.result, coin.decimals);
    if (norm > best) {
      best = norm;
      preferred = coin;
    }
  });

  // All-zero balances → keep USDT default
  if (best <= 0n) preferred = MINIPAY_STABLECOINS[0];

  const rawPreferred = balances[preferred.key];
  const preferredDisplay = rawPreferred !== undefined
    ? parseFloat(formatUnits(rawPreferred, preferred.decimals)).toFixed(2)
    : "—";

  return { preferred, balances, preferredDisplay, loaded };
}
