"use client";

import { useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { celo } from "wagmi/chains";
import { ARENA_V2_ABI, ARENA_V2_ACTIVE, ARENA_V2_ADDRESS } from "./arenaV2";
import { matchIdToBytes32 } from "./arena";
import { ERC20_ABI } from "./cusd";
import { MINIPAY_STABLECOINS } from "./stablecoins";
import { getMiniPayWriteOverrides } from "./minipay";
import { friendlyTxError, isInsufficientFunds, NO_GAS_MESSAGE } from "./txErrors";

export const BOSS_ONCHAIN_ENTRY_ENABLED = process.env.NEXT_PUBLIC_BOSS_ONCHAIN_ENTRY === "true";

// CELO's own ERC-20 interface. ArenaV2 escrows tokens and has no payable entry,
// so a web player's CELO goes in through the token path like everything else.
const CELO_ERC20 = "0x471EcE3750Da237f93B8E339c536989b8978a438" as `0x${string}`;

// 0.000007 of whichever token is used, matching the wager constants. Nominal on
// purpose: the point is a verifiable on-chain record of the run, not a fee.
const ENTRY_AMOUNT_18DP = 7_000_000_000_000n;
const ENTRY_AMOUNT_6DP = 7n;

// Enough gas for an approval plus an entry, with room to spare. Checked up
// front so an empty wallet is told what it needs instead of being walked into
// a revert it cannot read.
const MIN_GAS_WEI = 30_000_000_000_000_000n; // 0.03 CELO

// approve/allowance are not in the shared ERC20_ABI, which only covers
// transfer and balanceOf.
const ERC20_APPROVAL_ABI = [
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type BossEntryResult = {
  ok: boolean;
  skipped?: boolean;
  txHash?: `0x${string}`;
  error?: string;
  /** The wallet is empty. The UI should point at support, not offer a retry. */
  needsFunding?: boolean;
};

/**
 * True when starting a boss run will actually prompt a wallet transaction, so
 * the UI can show a "confirm in wallet" step only when there is something to
 * confirm.
 *
 * MiniPay is included: ArenaV2 takes any ERC-20, so a MiniPay player enters
 * with the stablecoin they already hold and pays gas in it too. The previous
 * exclusion was correct only for the V1 contract, whose entry was payable and
 * therefore needed native CELO that MiniPay wallets do not carry.
 */
export function bossEntryWillCharge(address: string | undefined, _isMiniPay: boolean): boolean {
  return BOSS_ONCHAIN_ENTRY_ENABLED && !!address && ARENA_V2_ACTIVE;
}

type EntryToken = { address: `0x${string}`; symbol: string; amount: bigint; unit: bigint };

function candidateTokens(isMiniPayWallet: boolean): EntryToken[] {
  if (isMiniPayWallet) {
    // MiniPay guideline: adapt to whichever stablecoin the player actually
    // holds rather than demanding a specific one.
    return MINIPAY_STABLECOINS.map((c) => ({
      address: c.address,
      symbol: c.symbol,
      amount: c.decimals === 6 ? ENTRY_AMOUNT_6DP : ENTRY_AMOUNT_18DP,
      unit: 10n ** BigInt(c.decimals),
    }));
  }
  return [{ address: CELO_ERC20, symbol: "CELO", amount: ENTRY_AMOUNT_18DP, unit: 10n ** 18n }];
}

export function useBossOnchainEntry() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: celo.id });

  return useCallback(
    async (address: `0x${string}` | undefined, isMiniPayWallet: boolean): Promise<BossEntryResult> => {
      if (!bossEntryWillCharge(address, isMiniPayWallet) || !address || !publicClient) {
        return { ok: true, skipped: true };
      }

      try {
        // A web wallet pays gas in native CELO. Checking first means an unfunded
        // player gets told to ask for a top-up, rather than a failed transaction
        // and a "try again" that can never work. MiniPay pays fees in its own
        // stablecoin, so it is exempt from this check.
        if (!isMiniPayWallet) {
          const gas = await publicClient.getBalance({ address });
          if (gas < MIN_GAS_WEI) return { ok: false, needsFunding: true, error: NO_GAS_MESSAGE };
        }

        // Pick the first token the player can actually pay with.
        let chosen: EntryToken | null = null;
        for (const token of candidateTokens(isMiniPayWallet)) {
          const balance = await publicClient
            .readContract({ address: token.address, abi: ERC20_ABI, functionName: "balanceOf", args: [address] })
            .catch(() => 0n);
          if ((balance as bigint) >= token.amount) { chosen = token; break; }
        }
        if (!chosen) {
          return {
            ok: false,
            needsFunding: true,
            error: isMiniPayWallet
              ? "Your wallet needs a small stablecoin balance to enter. Message t.me/actionorder and we'll help."
              : NO_GAS_MESSAGE,
          };
        }

        // ArenaV2 pulls the stake with transferFrom, so it needs an allowance.
        // Approve a whole token — about 140,000 runs — so this is a one-time
        // step rather than a second prompt before every fight.
        const allowance = (await publicClient
          .readContract({
            address: chosen.address,
            abi: ERC20_APPROVAL_ABI,
            functionName: "allowance",
            args: [address, ARENA_V2_ADDRESS],
          })
          .catch(() => 0n)) as bigint;

        if (allowance < chosen.amount) {
          const approvalHash = await writeContractAsync({
            address: chosen.address,
            abi: ERC20_APPROVAL_ABI,
            functionName: "approve",
            args: [ARENA_V2_ADDRESS, chosen.unit],
            account: address,
            chainId: celo.id,
            ...getMiniPayWriteOverrides(),
          });
          // Must land before the entry, or transferFrom reverts on a stale
          // allowance and the player sees a failure they did nothing to cause.
          await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        }

        // Fresh id per run so enterMatch never reverts on a reused one.
        const unique = `boss:${address}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const txHash = await writeContractAsync({
          address: ARENA_V2_ADDRESS,
          abi: ARENA_V2_ABI,
          functionName: "enterMatch",
          args: [matchIdToBytes32(unique), chosen.address, chosen.amount],
          account: address,
          chainId: celo.id,
          ...getMiniPayWriteOverrides(),
        });
        return { ok: true, txHash };
      } catch (e) {
        if (isInsufficientFunds(e)) return { ok: false, needsFunding: true, error: NO_GAS_MESSAGE };
        return { ok: false, error: friendlyTxError(e, "Couldn't enter the arena — please try again.") };
      }
    },
    [writeContractAsync, publicClient],
  );
}
