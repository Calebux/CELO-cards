"use client";

import { useCallback } from "react";
import { useWriteContract } from "wagmi";
import { celo } from "wagmi/chains";
import { ARENA_ADDRESS, ARENA_ABI, matchIdToBytes32 } from "./arena";

// On-chain "check-in" for boss (VS House) games. When enabled, starting a boss
// match fires a one-tap native-CELO `enterMatchWithCelo` on the legacy
// single-player arena (0x80b10a44…) purely to surface real play as real on-chain
// activity. It is pay-IN only — rewards stay manual/off-chain — so there is no
// drain vector and it's safe to run with automated wagers off.
//
// Toggle with NEXT_PUBLIC_BOSS_ONCHAIN_ENTRY=true. Off by default.
export const BOSS_ONCHAIN_ENTRY_ENABLED = process.env.NEXT_PUBLIC_BOSS_ONCHAIN_ENTRY === "true";

// MUST equal the deployed contract's ENTRY_FEE (0.000007 CELO); enterMatchWithCelo
// reverts on any other msg.value.
const BOSS_ENTRY_FEE_WEI = 7_000_000_000_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type BossEntryResult = { ok: boolean; skipped?: boolean; txHash?: `0x${string}`; error?: string };

// True when a boss start will actually prompt a wallet tx (so the UI can show a
// "confirm in wallet" step only when there's something to confirm).
export function bossEntryWillCharge(address: string | undefined, isMiniPay: boolean): boolean {
  return BOSS_ONCHAIN_ENTRY_ENABLED && !!address && !isMiniPay && ARENA_ADDRESS !== ZERO_ADDRESS;
}

export function useBossOnchainEntry() {
  const { writeContractAsync } = useWriteContract();
  return useCallback(
    async (address: `0x${string}` | undefined, isMiniPay: boolean): Promise<BossEntryResult> => {
      // Skip silently when off, misconfigured, walletless, or MiniPay (holds
      // stablecoins, not CELO — a native-CELO entry would just fail there).
      if (!bossEntryWillCharge(address, isMiniPay)) return { ok: true, skipped: true };
      try {
        // Fresh unique matchId each game (keccak of a unique string) so
        // enterMatchWithCelo never reverts on a reused id.
        const unique = `boss:${address}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const txHash = await writeContractAsync({
          address: ARENA_ADDRESS,
          abi: ARENA_ABI,
          functionName: "enterMatchWithCelo",
          args: [matchIdToBytes32(unique)],
          value: BOSS_ENTRY_FEE_WEI,
          account: address,
          chainId: celo.id,
        });
        return { ok: true, txHash };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const cancelled = /reject|denied|cancel|user rejected/i.test(msg);
        return { ok: false, error: cancelled ? "Entry cancelled." : "Couldn't enter the arena — please try again." };
      }
    },
    [writeContractAsync],
  );
}
