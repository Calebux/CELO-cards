"use client";

import { useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { celo } from "wagmi/chains";
import { MATCH_REGISTRY, MATCH_REGISTRY_ABI, MATCH_REGISTRY_ACTIVE } from "./matchRegistry";
import { getMiniPayWriteOverrides } from "./minipay";
import { friendlyTxError, isInsufficientFunds, NO_GAS_MESSAGE } from "./txErrors";

export const BOSS_ONCHAIN_ENTRY_ENABLED = process.env.NEXT_PUBLIC_BOSS_ONCHAIN_ENTRY === "true";

// MatchRegistry.recordMatch is ~30,000 gas and moves no money. This covers it
// several times over so a wallet is never walked into a revert it cannot read.
const MIN_GAS_WEI = 20_000_000_000_000_000n; // 0.02 CELO

export type BossEntryResult = {
  ok: boolean;
  skipped?: boolean;
  txHash?: `0x${string}`;
  error?: string;
  /** The wallet has no gas. The UI should point at support, not offer a retry. */
  needsFunding?: boolean;
};

/**
 * True when starting a boss run will prompt a wallet transaction, so the UI can
 * show a "confirm in wallet" step only when there is something to confirm.
 */
export function bossEntryWillCharge(address: string | undefined, _isMiniPay: boolean): boolean {
  return BOSS_ONCHAIN_ENTRY_ENABLED && !!address && MATCH_REGISTRY_ACTIVE;
}

/**
 * Record a boss run on-chain, signed by the player.
 *
 * Uses MatchRegistry rather than the Arena. The Arena is a two-player wager
 * escrow: its tokens are allowlisted (USDT/USDC/USDm — not CELO), and
 * completeMatch requires two equal stakes and a winner who is one of the
 * stakers. A boss run has a single player against the AI, so an Arena entry
 * could never be settled — it would sit Active for 24 hours and then be
 * refundable. MatchRegistry is the contract built for this: it takes no
 * payment, needs no approval and no allowlist, keeps a per-player and global
 * count, and emits MatchRecorded for indexers.
 *
 * It has been deployed and wired since May but never fired once, because its
 * only call site required MiniPay AND a ranked match, and MiniPay players can
 * only reach VS House.
 */
export function useBossOnchainEntry() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: celo.id });

  return useCallback(
    async (address: `0x${string}` | undefined, isMiniPayWallet: boolean): Promise<BossEntryResult> => {
      if (!bossEntryWillCharge(address, isMiniPayWallet) || !address) {
        return { ok: true, skipped: true };
      }

      try {
        // A web wallet pays gas in native CELO, so an empty one is told to ask
        // for a top-up rather than being handed a failure it can only retry
        // into. MiniPay pays fees in its own stablecoin and is exempt.
        if (!isMiniPayWallet && publicClient) {
          const gas = await publicClient.getBalance({ address });
          if (gas < MIN_GAS_WEI) return { ok: false, needsFunding: true, error: NO_GAS_MESSAGE };
        }

        // Unique per run, so each entry is its own record.
        const matchId = `boss:${address}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const txHash = await writeContractAsync({
          address: MATCH_REGISTRY,
          abi: MATCH_REGISTRY_ABI,
          functionName: "recordMatch",
          args: [matchId],
          account: address,
          chainId: celo.id,
          ...getMiniPayWriteOverrides(),
        });
        return { ok: true, txHash };
      } catch (e) {
        if (isInsufficientFunds(e)) return { ok: false, needsFunding: true, error: NO_GAS_MESSAGE };
        return { ok: false, error: friendlyTxError(e, "Couldn't record the run — please try again.") };
      }
    },
    [writeContractAsync, publicClient],
  );
}
